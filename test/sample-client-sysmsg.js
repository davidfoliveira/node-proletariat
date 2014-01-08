var
	Proletariat	= require('../lib/proletariat').Client;
	proletariat	= new Proletariat({host: "127.0.0.1"});


proletariat.on('sysmsg',function(m){
	console.log("Message: ",m);
});
proletariat.systemMessage({"do":"something"},function(){
	console.log("Everybody received the message");
//	process.exit(0);
});
