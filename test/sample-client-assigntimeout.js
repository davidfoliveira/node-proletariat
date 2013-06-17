var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"});


proletariat.work(
	[{bla:"ble"}],
	{assigntimeout: 4000},
	function(err,res,w){
		if ( err ) {
			console.log("Error running work: ",err);
			return process.exit(0);
		}

		console.log("Result: ",res);
		process.exit(-1);
	}
);
