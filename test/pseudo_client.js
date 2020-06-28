var	
	Client = require('../lib/proletariat').Client,
	c;

c = new Client({
	id: "client1",
	servers: [
		"127.0.0.1:1920",
		"127.0.0.1:1921",
		"127.0.0.1:1922",
		"127.0.0.1:1923",
		undefined
	],
	DEBUG: true
});
