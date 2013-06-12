var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"}),

	works = [];

// Generate 10 works

for ( var x = 0 ; x < 10 ; x++ ) {
	works.push(function(handler){
		var r = 3+3;
		handler(null,r);
	});
}

proletariat.workIndividual(works,{},function(err,res){
	if ( err ) {
		console.log("Error running work: ",err);
		return;
	}

	console.log("Result: ",res);
//	process.exit(0);
},function(err,res){
	console.log("Everything done");
	process.exit(0);
});
