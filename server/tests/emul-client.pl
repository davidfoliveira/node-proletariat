#!/usr/bin/perl

use JSON qw(to_json);
use Time::HiRes qw(usleep);

my $message = {
	type => "offer",
	slots => 5,
	txt => "this will be a very long long long long long ".("long "x(rand(100)*100))."string"
};


sub _format($) {
	my $j = to_json($_[0]);
	return pack('N',length($j)).$j;
}

while ( 1 ) {

my $msg = "";
for ( my $x = 0 ; $x < 100 ; $x++ ) {
	$message->{slots} = 5 * $x;
	$msg .= _format($message);
}

my $x = 0;
while ( $x < length($msg) ) {
	print substr($msg,$x,50000);
	$x += 50000;
#	usleep(rand(1)*1000);
}

}
