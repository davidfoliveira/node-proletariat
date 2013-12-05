var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"}),

	works = ["ok","ok","ok","ok","fail","ok"];

works = ["fail"];

proletariat.workIndividual(works,{},function(err,res,w){
	if ( err ) {
		console.log("Work "+w.original+" failed: ",err);
		return;
	}

	console.log("Result: ",res);
//	process.exit(0);
},function(err,res){
	if ( err ) {
		console.log("Everything failed: ",err);
		return process.exit(-1);
	}
	console.log("Everything done");
	process.exit(0);
});
