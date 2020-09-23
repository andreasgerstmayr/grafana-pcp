import { BackendSrvRequest, getBackendSrv } from '@grafana/runtime';
import { has, defaults } from 'lodash';
import { NetworkError } from '../../lib/models/errors/network';
import { MetricName, Labels } from '../../lib/models/pcp/pcp';
import { PmapiInstance, PmapiMetricMetadata, PmapiInstanceValue } from '../../lib/models/pcp/pmapi';
import { DefaultRequestOptions } from './models/pmapi';

export interface PmapiContext {
    context: number;
    labels: Labels;
}

export interface InstanceDomain {
    instances: PmapiInstance[];
    labels: Labels;
}

interface MetricsResponse {
    metrics: PmapiMetricMetadata[];
}

interface MetricInstanceValues {
    name: MetricName;
    instances: PmapiInstanceValue[];
}

interface FetchResponse {
    timestamp: number;
    values: MetricInstanceValues[];
}

interface StoreResponse {
    success: boolean;
}

interface DeriveResponse extends StoreResponse {}

interface ChildrenResponse {
    leaf: string[];
    nonleaf: string[];
}

export class MetricNotFoundError extends Error {
    constructor(readonly metric: string, message?: string) {
        super(message ?? `Cannot find metric ${metric}. Please check if the PMDA is enabled.`);
        this.metric = metric;
        Object.setPrototypeOf(this, MetricNotFoundError.prototype);
    }
}

export class NoIndomError extends Error {
    constructor(readonly metric: string, message?: string) {
        super(message ?? `Metric ${metric} has no instance domain.`);
        this.metric = metric;
        Object.setPrototypeOf(this, NoIndomError.prototype);
    }
}

export class MetricSemanticError extends Error {
    constructor(readonly expr: string, message?: string) {
        super(message ?? `Semantic error in '${expr}' definition.`);
        this.expr = expr;
        Object.setPrototypeOf(this, MetricSemanticError.prototype);
    }
}

export class MetricSyntaxError extends Error {
    constructor(readonly expr: string, message?: string) {
        super(message ?? `Syntax error in '${expr}' definition.`);
        this.expr = expr;
        Object.setPrototypeOf(this, MetricSyntaxError.prototype);
    }
}

export class DuplicateDerivedMetricNameError extends Error {
    constructor(readonly metric: string, message?: string) {
        super(message ?? `Duplicate derived metric name ${metric}`);
        this.metric = metric;
        Object.setPrototypeOf(this, DuplicateDerivedMetricNameError.prototype);
    }
}

export class PermissionError extends Error {
    constructor(readonly metric: string, message?: string) {
        super(message ?? `Insufficient permissions to store metric ${metric}. Please check the PMDA configuration.`);
        this.metric = metric;
        Object.setPrototypeOf(this, PermissionError.prototype);
    }
}

export class PmApi {
    constructor(private defaultRequestOptions: DefaultRequestOptions) {}

    async datasourceRequest(options: BackendSrvRequest) {
        options = defaults(options, this.defaultRequestOptions);
        try {
            return await getBackendSrv().datasourceRequest(options);
        } catch (error) {
            throw new NetworkError(error);
        }
    }

    /**
     * creates a new context
     * @param url
     * @param hostspec
     * @param polltimeout context timeout in seconds
     */
    async createContext(url: string, hostspec: string, polltimeout = 30): Promise<PmapiContext> {
        const response = await this.datasourceRequest({
            url: `${url}/pmapi/context`,
            params: { hostspec, polltimeout },
        });

        if (!has(response.data, 'context')) {
            throw new NetworkError('Received malformed response');
        }
        return response.data;
    }

    async getMetricMetadata(url: string, ctxid: number | null, names: string[]): Promise<MetricsResponse> {
        // if multiple metrics are requested and one is missing, pmproxy returns the valid metrics
        // if a single metric is requested which is missing, pmproxy returns 400
        const ctxPath = ctxid == null ? '' : `/${ctxid}`;
        try {
            const response = await this.datasourceRequest({
                url: `${url}/pmapi${ctxPath}/metric`,
                params: { names: names.join(',') },
            });

            if (!has(response.data, 'metrics')) {
                throw new NetworkError('Received malformed response');
            }
            return response.data;
        } catch (error) {
            if (has(error, 'data.message') && error.data.message.includes('Unknown metric name')) {
                return { metrics: [] };
            } else {
                throw error;
            }
        }
    }

    async getMetricInstances(url: string, ctxid: number | null, name: string): Promise<InstanceDomain> {
        const ctxPath = ctxid == null ? '' : `/${ctxid}`;
        try {
            const response = await this.datasourceRequest({
                url: `${url}/pmapi${ctxPath}/indom`,
                params: { name },
            });
            if (!has(response.data, 'instances')) {
                throw new NetworkError('Received malformed response');
            }
            return response.data;
        } catch (error) {
            if (has(error, 'data.message') && error.data.message.includes('metric has null indom')) {
                throw new NoIndomError(name);
            } else {
                throw error;
            }
        }
    }

    async getMetricValues(url: string, ctxid: number | null, names: string[]): Promise<FetchResponse> {
        const ctxPath = ctxid == null ? '' : `/${ctxid}`;
        const response = await this.datasourceRequest({
            url: `${url}/pmapi${ctxPath}/fetch`,
            params: { names: names.join(',') },
        });

        if (!has(response.data, 'timestamp')) {
            throw new NetworkError('Received malformed response');
        }
        return response.data;
    }

    async storeMetricValue(url: string, ctxid: number | null, name: string, value: string): Promise<StoreResponse> {
        const ctxPath = ctxid == null ? '' : `/${ctxid}`;
        try {
            const response = await this.datasourceRequest({
                url: `${url}/pmapi${ctxPath}/store`,
                params: { name, value },
            });
            return response.data;
        } catch (error) {
            if (has(error, 'data.message') && error.data.message.includes('failed to lookup metric')) {
                throw new MetricNotFoundError(name);
            } else if (
                has(error, 'data.message') &&
                error.data.message.includes('No permission to perform requested operation')
            ) {
                throw new PermissionError(name);
            } else if (has(error, 'data.message') && error.data.message.includes('Bad input')) {
                return { success: false };
            } else {
                throw error;
            }
        }
    }

    async createDerived(url: string, ctxid: number | null, expr: string, name: string): Promise<DeriveResponse> {
        const ctxPath = ctxid == null ? '' : `/${ctxid}`;
        try {
            const response = await this.datasourceRequest({
                url: `${url}/pmapi${ctxPath}/derive`,
                params: { name, expr },
            });
            return response.data;
        } catch (error) {
            if (has(error, 'data.message') && error.data.message.includes('Duplicate derived metric name')) {
                return { success: true };
            } else if (has(error, 'data.message') && error.data.message.includes('Semantic Error')) {
                throw new MetricSemanticError(expr);
            } else if (has(error, 'data.message') && error.data.message.includes('Syntax Error')) {
                throw new MetricSyntaxError(expr);
            } else {
                throw error;
            }
        }
    }

    async children(url: string, ctxid: number | null, prefix: string): Promise<ChildrenResponse> {
        const ctxPath = ctxid == null ? '' : `/${ctxid}`;
        const response = await this.datasourceRequest({
            url: `${url}/pmapi${ctxPath}/children`,
            params: { prefix },
        });
        return response.data;
    }
}
