"use strict";

const { ServiceBroker } = require("moleculer");
const ChannelsMiddleware = require("../..").Middleware;
const TracingMiddleware = require("../..").Tracing;

let c = 1;

// Create broker
const broker = new ServiceBroker({
	logLevel: {
		CHANNELS: "debug",
		"**": "info"
	},
	tracing: {
		enabled: true,
		exporter: [{ type: "Console" }, { type: "Event" }]
	},
	middlewares: [
		ChannelsMiddleware({
			adapter: {
				type: "Fake"
			},
			/*adapter: {
				type: "Kafka",
				options: { kafka: { brokers: ["localhost:9093"] } }
			},*/
			/*adapter: {
				type: "AMQP"
			},*/
			/*adapter: {
				type: "NATS"
			},*/
			/*
			adapter: {
				type: "Redis",
				options: {
					redis: "localhost:6379"
					//serializer: "MsgPack"
				}
			},
			*/
			context: true
		}),
		TracingMiddleware()
	],
	replCommands: [
		{
			command: "publish",
			alias: ["p"],
			async action(broker, args) {
				const payload = {
					id: ++c,
					name: "Jane Doe",
					pid: process.pid
				};

				await broker.call(
					"publisher.publish",
					{ payload, headers: { a: "123" } },
					{
						meta: {
							loggedInUser: {
								id: 12345,
								name: "John Doe",
								roles: ["admin"],
								status: true
							}
						}
					}
				);
			}
		}
	]
});

broker.createService({
	name: "publisher",
	actions: {
		async publish(ctx) {
			await broker.sendToChannel("my.topic", ctx.params.payload, {
				ctx,
				headers: ctx.params.headers
			});

			await broker.Promise.delay(1000);
		}
	}
});

broker.createService({
	name: "sub1",
	channels: {
		"my.topic": {
			//context: true,
			tracing: {
				//spanName: ctx => `My custom span: ${ctx.params.id}`,
				tags: {
					params: true,
					meta: true
				}
			},
			async handler(ctx, raw) {
				this.logger.info("Processing...", ctx);
				this.logger.info("RAW:", raw);

				await Promise.delay(100);

				await ctx.call("test.demo");

				this.logger.info("Processed!", ctx.params, ctx.meta);
			}
		}
	}
});

broker.createService({
	name: "test",
	actions: {
		async demo(ctx) {
			this.logger.info("Demo service called");
		}
	}
});

broker.createService({
	name: "event-handler",
	events: {
		"$tracing.spans": {
			tracing: false,
			handler(ctx) {
				this.logger.info("Tracing event received");
				ctx.params.forEach(span => this.logger.info(span));
			}
		}
	}
});

broker
	.start()
	.then(async () => {
		broker.repl();
	})
	.catch(err => {
		broker.logger.error(err);
		broker.stop();
	});
