import * as dateMock from 'jest-date-mock';
import PollSrv from "../services/poll_srv";
import DataStore from "../datastore";
import { PmapiSrv, Context } from "../services/pmapi_srv";
import * as fixtures from './lib/fixtures';

describe("PollSrv", () => {
    const ctx: { context: jest.Mocked<Context>, pmapiSrv: PmapiSrv, datastore: DataStore, pollSrv: PollSrv } = {} as any;

    beforeEach(() => {
        dateMock.clear();
        ctx.context = {
            indom: jest.fn(),
            metrics: jest.fn(),
            fetch: jest.fn()
        } as any;
        ctx.pmapiSrv = new PmapiSrv(ctx.context);
        ctx.datastore = new DataStore(ctx.pmapiSrv, 5 * 60 * 1000);
        ctx.pollSrv = new PollSrv(ctx.pmapiSrv, ctx.datastore, 20 * 1000);
    });

    it("should poll", async () => {
        ctx.context.metrics.mockResolvedValueOnce({
            metrics: [{
                ...fixtures.metricMetadataSingle
            }]
        });

        ctx.context.fetch.mockResolvedValueOnce({
            "timestamp": 5,
            "values": [{
                "pmid": "1.0.1",
                "name": "metric.single",
                "instances": [{
                    "instance": null,
                    "value": 100
                }]
            }]
        });

        await ctx.pollSrv.ensurePolling(["metric.single"]);
        await ctx.pollSrv.poll();

        const result = ctx.datastore.queryMetric("metric.single", 0, Infinity);
        expect(result).toStrictEqual([{
            "id": null,
            "name": "",
            "values": [
                [100, 5000]
            ],
            "labels": {}
        }]);
    });

    it("should add and remove metrics to poll", async () => {
        ctx.context.metrics.mockResolvedValueOnce({
            metrics: [{
                ...fixtures.metricMetadataSingle,
                name: "metric1"
            }, {
                ...fixtures.metricMetadataSingle,
                name: "metric2"
            }, {
                ...fixtures.metricMetadataSingle,
                name: "metric3"
            }]
        });

        await ctx.pollSrv.ensurePolling(["metric1", "metric2", "metric3"]);
        ctx.pollSrv.removeMetricsFromPolling(["metric2", "metric3"]);

        ctx.context.fetch.mockResolvedValueOnce({
            "timestamp": 1,
            "values": [
                { pmid: "1.0.1", name: "metric1", instances: [] }
            ]
        });

        await ctx.pollSrv.poll();
        expect(ctx.context.fetch).toHaveBeenCalledWith(["metric1"]);
    });

    it("should remove metrics which weren't requested in a specified time period", async () => {
        ctx.context.metrics.mockResolvedValueOnce({
            metrics: [{
                ...fixtures.metricMetadataSingle,
                name: "metric1"
            }, {
                ...fixtures.metricMetadataSingle,
                name: "metric2"
            }, {
                ...fixtures.metricMetadataSingle,
                name: "metric3"
            }]
        });
        ctx.context.fetch.mockResolvedValueOnce({
            "timestamp": 5,
            "values": [
                { pmid: "1.0.1", name: "metric1", instances: [] }
            ]
        });

        dateMock.advanceTo(10000);
        await ctx.pollSrv.ensurePolling(["metric1", "metric2", "metric3"]);
        dateMock.advanceTo(30000);
        await ctx.pollSrv.ensurePolling(["metric1"]);

        // max age is 20s
        // metric1 was requested 10s back, metric2 and metric3 30s back
        dateMock.advanceTo(40000);
        ctx.pollSrv.cleanExpiredMetrics();
        await ctx.pollSrv.poll();
        expect(ctx.context.fetch).toHaveBeenCalledWith(["metric1"]);
    });

});
