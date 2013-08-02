var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"}),

	works = [];

for ( var x = 0 ; x < 10 ; x++ ) {
	works.push(function(handler){
		var r = 3+3;
		setTimeout(function(){
			handler(null,r);
		},1000*Math.random()*7);
	});
}

proletariat.work(works,{keepState: true},function(err,res){
	if ( err ) {
		console.log("Error running work: ",err);
		return;
	}

	console.log("Result: ",res.length);
	process.exit(0);
});
setTimeout(function(){process.exit(0);},3000);
