# proletariat: distributed job processing on node.js made simple

`proletariat` is a simple and distributed job processing software made in node.js. On the current state, proletariat is single threaded.

# Installing

	npm install proletariat

# Running manager

Running supplied manager:

	node node_modules/proletariat/bin/manager.js

Making your own manager:

	var
	    Manager = require('../lib/proletariat').Manager,
	    manager = new Manager();

	// Start

	manager.start();


# Running workers

Create a new worker file:

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


# Running a client

Create a new client file:

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
