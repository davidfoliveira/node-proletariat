var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat("127.0.0.1"),

	start		= new Date();


proletariat.work(
	[{bla:"ble"}],
	function(err,res,w){
		if ( err ) {
			console.log("Error running work: ",err);
			return;
		}
		var spent = (new Date()).getTime() - start;

		console.log("Result: ",res);
		console.log("Spent: "+spent+"ms");
	}
);
