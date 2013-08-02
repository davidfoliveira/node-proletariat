var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"}),
	works = [];

for ( var x = 0 ; x < 12 ; x++ )
	works.push(function(handler){ setTimeout(function(){handler(null,3+6);},5000) });


proletariat.work(
	works,
	{priority: 2},
	function(err,res,w){
		if ( err ) {
			console.log("Error running work: ",err);
			return;
		}

		console.log("Result: ",res);
		process.exit(0);
	}
);
setTimeout(function(){process.exit(0);},500);
