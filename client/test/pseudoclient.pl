#!/usr/bin/perl

use IO::Socket;
use JSON qw(from_json to_json);

sub _format($) {
	my $j = eval { to_json(from_json($_[0])) };
	$j || print STDERR "$@\n";
	$j || return undef;
	print STDERR "Sending: ".to_json(from_json($_[0]))."\n";
	return pack('N',length($j)).$j;
}
sub _unformat($) {
}

my $sock = new IO::Socket::INET (
	PeerAddr => $ARGV[0] || '127.0.0.1',
	PeerPort => '1917',
	Proto => 'tcp',
);
die "Could not create socket: $!\n" unless $sock;
warn "Connected!\n";

while ( <STDIN> ) {
	s/\r?\n//g;
	my $msg = _format($_) || next;
	print STDERR "Sending..\n";
	print $sock $msg;

	my $b;
	read($sock,$b,4);
	my $len = unpack('N',$b);
	read($sock,$b,$len);
	print "$b\n";

}
close($sock);

