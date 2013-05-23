var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"});


proletariat.work(
	[{bla:"ble"}],
	{timeout: 2000},
	function(err,res,w){
		if ( err ) {
			console.log("Error running work: ",err);
			return;
		}

		console.log("Result: ",res);
		process.exit(0);
	}
);
