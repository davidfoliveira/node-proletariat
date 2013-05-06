var
	Proletariant	= require('../lib/proletariat-client').Client;
	proletariat	= new Proletariant("127.0.0.1"),

	works = [];

for ( var x = 0 ; x < 10000 ; x++ ) {
	works.push(function(handler){
		var r = 3+3;
		handler(null,r);
	});
}


var start = new Date();
proletariat.work(works,function(err,res){
	if ( err ) {
		console.log("Error running work: ",err);
		return;
	}

	var spent = (new Date()).getTime() - start;
	console.log("spent:\t"+spent+"ms");
//	console.log(res);
	process.exit(0);
//	console.log("Result: ",res);
});