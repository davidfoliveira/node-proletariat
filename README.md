# proletariat: distributed job processing on node.js made simple

`proletariat` is a simple and distributed job processing software made in node.js. On the current state, proletariat is single threaded.

# Installing

	npm install proletariat

# Running manager

Running supplied manager:

	node node_modules/proletariat/bin/manager.js

Making your own manager daemon:

	var
	    Manager = require('../lib/proletariat').Manager,
	    manager = new Manager();

	// Start
	manager.start();

Manager support this options:

`AVAIL_THRESHOLD` is the number of available slots that manager needs to have after getting full, for distributing work again. Default: `50`
`CLEANUP_REQS` is the number of finished works that the system needs to perform for running the cleanup routine. Default: `1000`
`CLEANUP_CHECKINT` is the interval of time (ms) for running the cleanup routine (in case of having empty working queue). Default: `60000`
`DISTRIB_RANDMAX` is the maximum number of ms for waiting before distributing work (this will give time for getting new free slots). Default: `100`
`DEBUG` is for showing or hidding debug messages. Default: `false`.


# Running workers

Create a new worker file and run it (multiple instances of it, if you want):

	var
	    Worker = require('../lib/proletariat').Worker,
	    worker = new Worker({slots: 100, host: "127.0.0.1"});

	// Start it
	worker.start();

	// New work arrive
	worker.on('work',function(w,handler){
	    // This will take time
	    setTimeout(function(){
	        handler(null,"Greetings, comrade!");
	    }, 1000);
	});

Worker support this options:

`slots` is the number of work slots that this worker will hold. Default: `100`
`host` is the address of the machine where the manager is running. Default: `127.0.0.1`
`port` is the port where the manager is binding on. Default: `1917`
`CLEANUP_REQS` is the number of finished works that the system needs to perform for running the cleanup routine. Default: `1000`
`CLEANUP_CHECKINT` is the interval of time (ms) for running the cleanup routine (in case of having empty working queue). Default: `60000`
`CON_RETRYTIME` is the time (ms) for waiting before reconnecting to server. Default: `2000`
`ANSWER_THRESHOLD` is the number of work answers to keep in memory before answering to server. Default: 25% of the `slots` number.

# Running a client and pushing work

Create a new client file and run it:

	var
	    Proletariat = require('../lib/proletariat').Client,
	    proletariat = new Proletariat("127.0.0.1");

	proletariat.work([{some:"work"}],function(err,res){
	    if ( err ) {
	        console.log("Fail at work: ",err);
	        return;
	    }

	    console.log("Result: ",res);
	});

Client support this options:

`host` is the address of the machine where the manager is running. Default: `127.0.0.1`
`port` is the port where the manager is binding on. Default: `1917`
