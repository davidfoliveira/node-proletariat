var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"});


proletariat.work(
	function(handler){
		var r = 2+2;
		handler(null,r);
	},
	function(err,res,w){
		if ( err ) {
			console.log("Error running work: ",err);
			return;
		}

		console.log("Result: ",res);
	}
);
