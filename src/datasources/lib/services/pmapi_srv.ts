import _ from 'lodash';
import { synchronized, isBlank } from '../utils';
import { MetricMetadata, IndomInstance, MetricValues } from '../models/pmapi';
import { DatasourceRequestFn } from '../models/datasource';
import { Labels } from '../models/metrics';

export interface MetricsResponse {
    metrics: MetricMetadata[];
}

export interface IndomResponse {
    instances: IndomInstance[];
}

export interface FetchResponse {
    timestamp: number;
    values: MetricValues[];
}

export interface StoreResponse {
    success: boolean;
}

export interface ChildrenResponse {
    leaf: string[];
    nonleaf: string[];
}

export class Context {

    private context: string;
    private isPmwebd = false;
    private d = '';

    constructor(private datasourceRequest: DatasourceRequestFn, private url: string, private container?: string) {
    }

    newInstance() {
        return new Context(this.datasourceRequest, this.url, this.container);
    }

    @synchronized
    async createContext() {
        const contextResponse = await this.datasourceRequest({
            url: `${this.url}/pmapi/context`,
            params: { hostspec: "127.0.0.1", polltimeout: 30 }
        });
        this.context = contextResponse.data.context;

        // only pmproxy contains source attribute
        if (!contextResponse.data.source) {
            // pmwebd compat
            this.isPmwebd = true;
            this.d = '_';
        }

        if (!isBlank(this.container)) {
            await this.datasourceRequest({
                url: `${this.url}/pmapi/${this.context}/${this.d}store`,
                params: { name: "pmcd.client.container", value: this.container }
            });
        }
    }

    private async ensureContext(fn: () => any) {
        if (!this.context) {
            await this.createContext();
        }

        try {
            return await fn();
        } catch (error) {
            if ((_.isString(error.data) && error.data.includes("12376")) ||
                (_.isObject(error.data) && error.data.message.includes("unknown context identifier"))) {
                console.debug("context expired, creating new context...");
                await this.createContext();
                return await fn();
            }
            else {
                throw error;
            }
        }
    }

    async metrics(metrics: string[]): Promise<MetricsResponse> {
        const response: MetricsResponse = await this.ensureContext(async () => {
            try {
                const response = await this.datasourceRequest({
                    url: `${this.url}/pmapi/${this.context}/${this.d}metric`,
                    params: { names: metrics.join(',') }
                });
                return response.data;
            }
            catch (e) {
                // pmproxy throws an exception if exactly one metric is requested
                // and this metric is not found
                if (e.data && !e.data.success)
                    return { metrics: [] };
                else
                    throw e;
            }
        });

        if (this.isPmwebd) {
            for (const metric of response.metrics) {
                metric.labels = {};
            }
        }
        return response;
    }

    async indom(metric: string): Promise<IndomResponse> {
        const response: IndomResponse = await this.ensureContext(async () => {
            const response = await this.datasourceRequest({
                url: `${this.url}/pmapi/${this.context}/${this.d}indom`,
                params: { name: metric }
            });
            return response.data;
        });

        if (this.isPmwebd) {
            for (const instance of response.instances) {
                instance.labels = {};
            }
        }
        return response;
    }

    async fetch(metrics: string[]): Promise<FetchResponse> {
        const data = await this.ensureContext(async () => {
            try {
                const response = await this.datasourceRequest({
                    url: `${this.url}/pmapi/${this.context}/${this.d}fetch`,
                    params: { names: metrics.join(',') }
                });
                return response.data;
            }
            catch (e) {
                // pmwebd throws an exception if exactly one metric is requested
                // and this metric is not found
                if (_.isString(e.data) && e.data.includes("-12443"))
                    return { timestamp: 0, values: [] };
                else
                    throw e;
            }
        });

        if (this.isPmwebd) {
            data.timestamp = data.timestamp.s + data.timestamp.us / 1000000;
            for (const metric of (data as FetchResponse).values) {
                for (const instance of metric.instances) {
                    if (instance.instance === -1)
                        instance.instance = null;
                }
            }
        }

        return data;
    }

    async store(metric: string, value: string): Promise<StoreResponse> {
        return await this.ensureContext(async () => {
            const response = await this.datasourceRequest({
                url: `${this.url}/pmapi/${this.context}/${this.d}store`,
                params: { name: metric, value: value }
            });
            return response.data;
        });
    }

    async children(prefix: string): Promise<ChildrenResponse> {
        return await this.ensureContext(async () => {
            const response = await this.datasourceRequest({
                url: `${this.url}/pmapi/${this.context}/${this.d}children`,
                params: { prefix: prefix }
            });
            return response.data;
        });
    }
}

export class PmapiSrv {
    private metricMetadataCache: Record<string, MetricMetadata> = {};
    private instanceCache: Record<string, Record<number, IndomInstance>> = {}; // instanceCache[metric][instance_id] = instance
    private childrenCache: Record<string, ChildrenResponse> = {};

    constructor(readonly context: Context) {
    }

    async getMetricMetadatas(metrics: string[]): Promise<Record<string, MetricMetadata>> {
        const requiredMetrics = _.difference(metrics, Object.keys(this.metricMetadataCache));
        if (requiredMetrics.length > 0) {
            const metadatas = await this.context.metrics(requiredMetrics);
            for (const metricMetadata of metadatas.metrics) {
                this.metricMetadataCache[metricMetadata.name] = metricMetadata;
            }
        }
        return _.pick(this.metricMetadataCache, metrics);
    }

    async getMetricMetadata(metric: string): Promise<MetricMetadata> {
        const metadata = await this.getMetricMetadatas([metric]);
        return metadata[metric];
    }

    async getIndoms(metric: string, ignoreCache = false): Promise<Record<number, IndomInstance>> {
        if (!(metric in this.instanceCache) || ignoreCache) {
            const response = await this.context.indom(metric);
            this.instanceCache[metric] = {};
            for (const instance of response.instances) {
                this.instanceCache[metric][instance.instance] = instance;
            }
        }
        return this.instanceCache[metric] || {};
    }

    async getIndom(metric: string, instance: number, cacheOnly = false): Promise<IndomInstance | undefined> {
        if (!(metric in this.instanceCache && instance in this.instanceCache[metric]) && !cacheOnly)
            await this.getIndoms(metric, true);
        return (this.instanceCache[metric] || {})[instance];
    }

    async getMetricValues(metrics: string[]): Promise<FetchResponse> {
        const response = await this.context.fetch(metrics);

        const returnedMetrics = response.values.map(metric => metric.name);
        const missingMetrics = _.difference(metrics, returnedMetrics);
        if (missingMetrics.length > 0) {
            console.debug(`fetch didn't include result for ${missingMetrics.join(', ')}, clearing it from metric metadata and indom cache`);
            for (const missingMetric of missingMetrics) {
                delete this.metricMetadataCache[missingMetric];
                delete this.instanceCache[missingMetric];
            }
        }
        return response;
    }

    async storeMetricValue(metric: string, value: string): Promise<StoreResponse> {
        return await this.context.store(metric, value);
    }

    async getChildren(prefix: string): Promise<ChildrenResponse> {
        if (prefix in this.childrenCache)
            return this.childrenCache[prefix];

        const response = await this.context.children(prefix);
        this.childrenCache[prefix] = response;
        return this.childrenCache[prefix];
    }

    async getLabels(metric: string, instance?: number | null, cacheOnly = false): Promise<Labels> {
        const metadata = await this.getMetricMetadata(metric);
        if (!metadata)
            return {};

        const labels = metadata.labels;
        if (instance) {
            const indom = await this.getIndom(metric, instance, cacheOnly);
            if (indom)
                Object.assign(labels, indom.labels);
        }
        return labels;
    }
}
