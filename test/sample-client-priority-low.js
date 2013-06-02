var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"}),

	lowpri = [];

for ( var x = 0 ; x < 18 ; x++ )
	lowpri.push({bla:"ble"});

proletariat.work(
	lowpri,
	{priority: 0},
	function(err,res,w){
		if ( err ) {
			console.log("Error running work: ",err);
			return;
		}

		console.log("Result: ",res);
		process.exit(0);
	}
);
