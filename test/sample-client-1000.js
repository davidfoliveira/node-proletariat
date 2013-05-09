var
	Proletariat	= require('../lib/proletariat').Client;
//	proletariat	= new Proletariat("127.0.0.1"),
	proletariat	= new Proletariat("nheca-web01.blogs.bk.sapo.pt"),

	works = [];

for ( var x = 0 ; x < 1000 ; x++ ) {
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
	process.exit(0);
//	console.log(res);
//	console.log("Result: ",res);
});
