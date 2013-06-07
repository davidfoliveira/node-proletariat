# proletariat: distributed job processing on node.js made simple

`proletariat` is a simple and distributed job processing software made in node.js. On the current state, proletariat is single threaded.

# Installing

	npm install proletariat

# Running manager

Running supplied manager:

	node node_modules/proletariat/bin/manager.js

Making your own manager daemon:

	var
	    Manager = require('proletariat').Manager,
	    manager = new Manager();

	// Start
	manager.start();

Manager support this options:

`AVAIL_THRESHOLD` is the number of available slots that manager needs to have after getting full, for distributing work again. Default: `50`

`CLEANUP_REQS` is the number of finished jobs that the system needs to perform for running the cleanup routine. Default: `1000`

`CLEANUP_CHECKINT` is the interval of time (ms) for running the cleanup routine (in case of having empty working queue). Default: `60000`

`DISTRIB_RANDMAX` is the maximum number of ms for waiting before distributing work (this will give time for getting new free slots). Default: `100`

`DEBUG` is for showing or hidding debug messages. Default: `false`.

`SACRED_GUARANTEES` is for when you are using guaranteed priority slots, choosing to strictly respected guaranteed in case of having too much high priority jobs.



# Running workers

Create a new worker file and run it (multiple instances of it, if you want):

	var
	    Worker = require('proletariat').Worker,
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

`prioritySlots` is for defining guarantees for ranges of priorities. Default: { 0: value_of_slots_option }

`CLEANUP_REQS` is the number of finished jobs that the system needs to perform for running the cleanup routine. Default: `1000`

`CLEANUP_CHECKINT` is the interval of time (ms) for running the cleanup routine (in case of having empty working queue). Default: `60000`

`CON_RETRYTIME` is the time (ms) for waiting before reconnecting to server. Default: `2000`

`ANSWER_THRESHOLD` is the number of work answers to keep in memory before answering to server. Default: `1`.


# Running a client and pushing work

Create a new client file and run it:

	var
	    Proletariat = require('proletariat').Client,
	    proletariat = new Proletariat("127.0.0.1");

	proletariat.work([{some:"work"}],{timeout: 60000, priority: 1},function(err,res){
	    if ( err ) {
	        console.log("Fail at work: ",err);
	        return;
	    }

	    console.log("Result: ",res);
	});

Client support this options:

`host` is the address of the machine where the manager is running. Default: `127.0.0.1`

`port` is the port where the manager is binding on. Default: `1917`

and this methods:

`work(workGroup,options,finishCallback)` for pushing a work or a work group. Supported options are: `timeout` and `priority`.

`workIndividual(workGroup,options,workCallback,groupCallback)` for pushing a work group and calling workCallback for each finished work and groupCallback when all the work group has finished. Options are the same as for `work()`.


# How does it work ?

![Architecture](https://cld.pt/dl/download/e930e1bf-d240-46f9-ac5e-38ae0fdcca67/howdoesitwork.png?download=true)

From top to bottom:

Clients just connect to the manager, push some works and wait for the answer.

Manager receives connections from clients and workers. If the client makes an offer (work force) he's then called a `worker`. It the client pushes some work, he will be treated as a simple client. When a client pushes some work, it will be registered on a specific queue, according to the work's priority and then, when possible, will be assigned to an available worker. When the worker finishes doing that task, answers to the manager, who sends it back to the client.


## Assigning

The default work->worker assigning function tends to balance the workload on all the workers, being more probable to assign a task to a free worker than a busiest one. Anyway, being the function based on Math.random(), something else can happen.

Some systems may need to implement their own assigning function. Example:

	manager.workSelectWorker = function(work,workers,totalAvailable) {

	        var
	                comrades = Object.keys(workers);

	        return this.workers[comrades[parseInt(Math.random()*comrades.length)]];

	};

	// Start

	manager.start();


## Timeouts

`client.work()` and `client.workIndividual()` support specifying a `timeout` which will be the running timeout. It starts counting at the same moment that work starts running on the worker.


## Priorities and guarantees

`client.work()` and `client.workIndividual` support specifying a priority for the work or work group. High priority works will be firstly assigned to the workers when they have available slots, however, without guarantees that they will be immediatelly assigned.

For having guarantees that high priority tasks will have available slots, you should play with the `prioritySlots` and `slots` options on the worker(s). The `prioritySlots` option will allow us to define priority ranges and set a number of guaranteed slots for each range.

Example: Setting `slots` number to 100 and `prioritySlots` to `{1:30,2:20}` will define the limit of 50 simultaneous works with priority >= 0 and < 1, 80 to works with priority >= 1 and < 2 and 100 to works with priority >= 2. This rules will guarantee that low priority works will never run out of certain limits, keeping space for high priority works.

But, if you were paying attention, you could notice that high priority tasks can still take all the system slots, even stealing the "guaranteed" slots of lower priority ranges. Using the case of last example, you can't be sure that works with priority of 2 will not take the "guaranteed" space for works with priority >= 1 and < 2.

For keeping this guarantees, you should set the manager option `SACRED_GUARANTEES` to true. This will make sure that if higher priority works will start going out of their guaranteed space, they will only steal slots from the lowest priority range (usually the range >= 0), saving the other guarantees. Again, using the example, but now setting manager `SACRED_GUARANTEES` to true, we will be defining the limit of 50 to works with priority >= 0 and < 1, 80 to works with priority >= 1 and < 2 and 70 to works with priority >= 2.
