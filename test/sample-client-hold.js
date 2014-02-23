var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"});


proletariat.work(
	[
		{fn:"sleep",sleep: 1, _key: "wait"},
		{fn:"sleep",sleep: 5, _key: "wait"},
		{fn:"sleep",sleep: 5, _key: "wait"}
	],
	function(err,res,w){
		if ( err ) {
			console.log("Error running work: ",err);
			return;
		}

		console.log("Result: ",res);
		process.exit(0);
	}
);
