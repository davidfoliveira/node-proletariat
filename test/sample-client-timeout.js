var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"}),

	works = [];

// Generate 10 works

for ( var x = 0 ; x < 10 ; x++ ) {
	works.push({fn:"sleep",sleep:1.300+(x/10)});
}

proletariat.work(works,{timeout:2000},function(err,res){
	if ( err ) {
		console.log("Error: ",err);
		return;
	}
	console.log("Everything done");
	console.log("res: ",res);
	process.exit(0);
});
