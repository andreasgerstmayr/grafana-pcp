import DataStore from "../datastore";

describe("DataStore", () => {
    let ctx: any = {};

    beforeEach(() => {
        ctx.context = {
            findMetricMetadata: jest.fn()
        }
        ctx.datastore = new DataStore(ctx.context, 25000); // max age: 25s
    });

    it("should ingest single metrics", () => {
        ctx.context.findMetricMetadata.mockReturnValue({});
        ctx.datastore.ingest({
            "timestamp": {
                "s": 5,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.scalar",
                "instances": [{
                    "instance": -1,
                    "value": 45200,
                    "instanceName": null
                }]
            }]
        });
        ctx.datastore.ingest({
            "timestamp": {
                "s": 6,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.scalar",
                "instances": [{
                    "instance": -1,
                    "value": 55200,
                    "instanceName": null
                }]
            }]
        });

        const result = ctx.datastore.queryTimeSeries(["bpftrace.scripts.script1.data.scalar"], 0, Infinity);
        const expected = [{
            "target": "bpftrace.scripts.script1.data.scalar",
            "datapoints": [
                [45200, 5002],
                [55200, 6002]
            ]
        }];
        expect(result).toStrictEqual(expected);
    });

    it("should ingest metrics with instance domains", () => {
        ctx.context.findMetricMetadata.mockReturnValue({});
        ctx.datastore.ingest({
            "timestamp": {
                "s": 5,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.multiple",
                "instances": [{
                    "instance": 1,
                    "value": 45200,
                    "instanceName": "/dev/sda1"
                }, {
                    "instance": 2,
                    "value": 55200,
                    "instanceName": "/dev/sda2"
                }]
            }]
        });

        const result = ctx.datastore.queryTimeSeries(["bpftrace.scripts.script1.data.multiple"], 0, Infinity);
        const expected = [{
            "target": "/dev/sda1",
            "datapoints": [[45200, 5002]]
        }, {
            "target": "/dev/sda2",
            "datapoints": [[55200, 5002]]
        }];
        expect(result).toStrictEqual(expected);
    });

    it("should perform rate-conversation for counters", () => {
        ctx.context.findMetricMetadata.mockReturnValue({ sem: "counter" });
        ctx.datastore.ingest({
            "timestamp": {
                "s": 5,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.scalar",
                "instances": [{
                    "instance": -1,
                    "value": 45200,
                    "instanceName": null
                }]
            }]
        });
        ctx.datastore.ingest({
            "timestamp": {
                "s": 6,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.scalar",
                "instances": [{
                    "instance": -1,
                    "value": 55200,
                    "instanceName": null
                }]
            }]
        });
        ctx.datastore.ingest({
            "timestamp": {
                "s": 7,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.scalar",
                "instances": [{
                    "instance": -1,
                    "value": 75200,
                    "instanceName": null
                }]
            }]
        });

        const result = ctx.datastore.queryTimeSeries(["bpftrace.scripts.script1.data.scalar"], 0, Infinity);
        const expected = [{
            "target": "bpftrace.scripts.script1.data.scalar",
            "datapoints": [
                [10000, 6002, 55200],
                [20000, 7002, 75200]
            ]
        }];
        expect(result).toStrictEqual(expected);
    });

    it("should remove old data from bpftrace output variables", () => {
        ctx.context.findMetricMetadata.mockReturnValue({ labels: { metrictype: "output" } });
        ctx.datastore.ingest({
            "timestamp": {
                "s": 5,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.output",
                "instances": [{
                    "instance": -1,
                    "value": "line1\n",
                    "instanceName": null
                }]
            }]
        });
        ctx.datastore.ingest({
            "timestamp": {
                "s": 6,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.output",
                "instances": [{
                    "instance": -1,
                    "value": "line1\nline2\n",
                    "instanceName": null
                }]
            }]
        });

        const result = ctx.datastore.queryTimeSeries(["bpftrace.scripts.script1.data.output"], 0, Infinity);
        const expected = [{
            "target": "bpftrace.scripts.script1.data.output",
            "datapoints": [["line1\nline2\n", 6002]]
        }];
        expect(result).toStrictEqual(expected);
    });

    it("should return metrics in time range", () => {
        ctx.context.findMetricMetadata.mockReturnValue({});
        ctx.datastore.ingest({
            "timestamp": {
                "s": 5,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.scalar",
                "instances": [{
                    "instance": -1,
                    "value": 45200,
                    "instanceName": null
                }]
            }]
        });
        ctx.datastore.ingest({
            "timestamp": {
                "s": 6,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.scalar",
                "instances": [{
                    "instance": -1,
                    "value": 55200,
                    "instanceName": null
                }]
            }]
        });
        ctx.datastore.ingest({
            "timestamp": {
                "s": 7,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.scalar",
                "instances": [{
                    "instance": -1,
                    "value": 65200,
                    "instanceName": null
                }]
            }]
        });

        expect(ctx.datastore.queryTimeSeries(["bpftrace.scripts.script1.data.scalar"], 0, Infinity))
            .toStrictEqual([{
                "target": "bpftrace.scripts.script1.data.scalar",
                "datapoints": [
                    [45200, 5002],
                    [55200, 6002],
                    [65200, 7002]
                ]
            }]);

        expect(ctx.datastore.queryTimeSeries(["bpftrace.scripts.script1.data.scalar"], 6002, 6003))
            .toStrictEqual([{
                "target": "bpftrace.scripts.script1.data.scalar",
                "datapoints": [
                    [55200, 6002]
                ]
            }]);
    });

    it("should clean expired metrics", () => {
        ctx.context.findMetricMetadata.mockReturnValue({});
        const date1 = new Date().getTime() - 30000  // 30s ago
        const date2 = new Date().getTime() - 20000
        const date3 = new Date().getTime() - 10000

        ctx.datastore.ingest({
            "timestamp": {
                "s": date1 / 1000,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.scalar",
                "instances": [{
                    "instance": -1,
                    "value": 45200,
                    "instanceName": null
                }]
            }]
        });
        ctx.datastore.ingest({
            "timestamp": {
                "s": date2 / 1000,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.scalar",
                "instances": [{
                    "instance": -1,
                    "value": 55200,
                    "instanceName": null
                }]
            }]
        });
        ctx.datastore.ingest({
            "timestamp": {
                "s": date3 / 1000,
                "us": 2000
            },
            "values": [{
                "pmid": 633356298,
                "name": "bpftrace.scripts.script1.data.scalar",
                "instances": [{
                    "instance": -1,
                    "value": 65200,
                    "instanceName": null
                }]
            }]
        });

        // clean metrics older than 25s
        ctx.datastore.cleanExpiredMetrics();

        const result = ctx.datastore.queryTimeSeries(["bpftrace.scripts.script1.data.scalar"], 0, Infinity);
        expect(result[0].datapoints).toHaveLength(2);
        const maxAge = new Date().getTime() - 25000;
        expect(result[0].datapoints[0][0]).toEqual(55200);
        expect(result[0].datapoints[0][1]).toBeGreaterThanOrEqual(maxAge);
        expect(result[0].datapoints[1][0]).toEqual(65200);
        expect(result[0].datapoints[1][1]).toBeGreaterThanOrEqual(maxAge);
    });

});
