var fn = function(handler){
	var r = 3+3;
	handler(null,r);
};


res = 0;
for ( var x = 0 ; x < 100000 ; x++ ) {

	var
		FN = fn.toString('utf-8'),
		_Fn;

		eval("_Fn = "+FN);

	_Fn(function(err,data){
		res++;
		if ( ++res == 10000 )
			console.log(data);
	});

}
