#!/usr/bin/perl

#my $path_info = "/futebol/primeira_liga/artigo/2013/05/02/_campeonato_passa_a_ser_sujinho_.html";
my $path_info = "/opiniao/jogo_limpo/artigo/2013/05/03/benfica_volta_a_amesterd_o.html";
#my $location = "/artigo/";
my $location = "/opiniao/(jogo_limpo|pedro_gomes)/";

if ( $path_info =~ s{^($location)/?}{/} ) {
	print "YEY!!\n";
}
#if ( $path_info =~ /^($location)\/?/ ) {
#	print "YEY!!\n";
#}
