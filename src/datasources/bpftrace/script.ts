import _ from 'lodash';
import { PmapiSrv } from "../lib/services/pmapi_srv";
import DataStore from "../lib/datastore";
import { TargetFormat } from '../lib/models/datasource';

enum MetricType {
    Histogram = "histogram",
    Output = "output"
}

export enum ScriptStatus {
    Stopped = "stopped",
    Starting = "starting",
    Started = "started",
    Stopping = "stopping"
}

export default class BPFtraceScript {
    /* tslint:disable:variable-name */
    readonly name: string;
    readonly vars: string[];
    status: ScriptStatus;
    exit_code: number | null;
    output: string;

    // additional properties by ScriptRegistry
    readonly code: string;
    lastRequested: number;

    constructor(registerResponse: any, code: string) {
        this.name = registerResponse.name;
        this.vars = registerResponse.vars;
        this.status = registerResponse.status;
        this.exit_code = registerResponse.exit_code;
        this.output = registerResponse.output;

        this.code = code;
        this.lastRequested = new Date().getTime();
    }

    hasFailed() {
        return this.status === ScriptStatus.Stopped && this.exit_code !== 0;
    }

    getControlMetrics() {
        return [
            `bpftrace.scripts.${this.name}.status`,
            `bpftrace.scripts.${this.name}.exit_code`,
            `bpftrace.scripts.${this.name}.output` // output of the bpftrace executable, not bpftrace scripts
        ];
    }

    private async findMetricForMetricType(pmapiSrv: PmapiSrv, metrictype: MetricType) {
        for (const var_ of this.vars) {
            const metric = `bpftrace.scripts.${this.name}.data.${var_}`;
            const labels = await pmapiSrv.getLabels(metric);
            if (labels.metrictype === metrictype)
                return metric;
        }
        return null;
    }

    async getDataMetrics(pmapiSrv: PmapiSrv, format: TargetFormat) {
        if (format === TargetFormat.TimeSeries) {
            return this.vars.map(var_ => `bpftrace.scripts.${this.name}.data.${var_}`);
        }
        else if (format === TargetFormat.Heatmap) {
            const metric = await this.findMetricForMetricType(pmapiSrv, MetricType.Histogram);
            if (!metric)
                throw new Error("Cannot find any histogram in this BPFtrace script.");
            return [metric];
        }
        else if (format === TargetFormat.Table) {
            const metric = await this.findMetricForMetricType(pmapiSrv, MetricType.Output);
            if (!metric)
                throw new Error("Table format is only supported with printf() BPFtrace scripts.");
            return [metric];
        }
        throw new Error("Unsupported panel format.");
    }

    syncState(datastore: DataStore) {
        const queryResult = datastore.queryMetrics(null, this.getControlMetrics(), 0, Infinity);
        for (const metric of queryResult.metrics) {
            if (metric.instances.length > 0 && metric.instances[0].values.length > 0) {
                const metric_field = metric.name.substring(metric.name.lastIndexOf('.') + 1);
                // datastore doesn't retain old values of metrics with agent=bpftrace, metrictype=control,
                // so it's safe to pick the first value (is always the latest)
                this[metric_field] = metric.instances[0].values[0][0];
            }
        }
    }
}
