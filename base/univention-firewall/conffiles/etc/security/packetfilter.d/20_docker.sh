#!/bin/sh
@%@UCRWARNING=# @%@
#
# Copyright 2015-2019 Univention GmbH
#
# http://www.univention.de/
#
# All rights reserved.
#
# The source code of this program is made available
# under the terms of the GNU Affero General Public License version 3
# (GNU AGPL V3) as published by the Free Software Foundation.
#
# Binary versions of this program provided by Univention to you as
# well as other copyrighted, protected or trademarked materials like
# Logos, graphics, fonts, specific documentations and configurations,
# cryptographic keys etc. are subject to a license agreement between
# you and Univention and not subject to the GNU AGPL V3.
#
# In the case you use this program under the terms of the GNU AGPL V3,
# the program is provided in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public
# License with the Debian GNU/Linux or Univention distribution in file
# /usr/share/common-licenses/AGPL-3; if not, see
# <http://www.gnu.org/licenses/>.

nat_core_rules() {
	# create docker chains if missing
	iptables --wait -L DOCKER > /dev/null 2> /dev/null || iptables --wait -N DOCKER
	iptables --wait -L DOCKER -t nat > /dev/null 2> /dev/null || iptables --wait -N DOCKER -t nat
	iptables --wait -L DOCKER-ISOLATION -t filter > /dev/null 2> /dev/null || iptables --wait -N DOCKER-ISOLATION -t filter

	iptables --wait -t nat -A PREROUTING -m addrtype --dst-type LOCAL -j DOCKER
	iptables --wait -t nat -A OUTPUT ! -d 127.0.0.0/8 -m addrtype --dst-type LOCAL -j DOCKER
@!@
import ipaddr
docker0_net = ipaddr.IPv4Network(configRegistry.get('docker/daemon/default/opts/bip', '172.17.42.1/16'))
docker_compose_net = ipaddr.IPv4Network(configRegistry.get('appcenter/docker/compose/network', '172.16.1.1/16'))
mysql_port = configRegistry.get('mysql/config/mysqld/port', '3306')
print '\tiptables --wait -t nat -A POSTROUTING -s %s/%s ! -o docker0 -j MASQUERADE' % (str(docker0_net.network), str(docker0_net.prefixlen))
print '\tiptables --wait -A INPUT -s %s/%s -p tcp --dport %s -j ACCEPT  # allow MySQL for Docker Apps' % (str(docker0_net.network), str(docker0_net.prefixlen), mysql_port)
print '\tiptables --wait -A INPUT -s %s/%s -p tcp --dport %s -j ACCEPT  # allow MySQL for Docker Compose Apps' % (str(docker_compose_net.network), str(docker_compose_net.prefixlen), mysql_port)
@!@
	iptables --wait -A FORWARD -o docker0 -j DOCKER
	iptables --wait -A FORWARD -o docker0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
	iptables --wait -A FORWARD -i docker0 ! -o docker0 -j ACCEPT
	iptables --wait -A FORWARD -i docker0 -o docker0 -j ACCEPT
	iptables --wait -I DOCKER-ISOLATION -j RETURN
	iptables --wait -I DOCKER -t nat -i docker0 -j RETURN
	iptables --wait -I FORWARD -j DOCKER-ISOLATION
}

nat_container_rule() {
	IP=$(docker inspect --format='{{.NetworkSettings.IPAddress}}' "$1")

	# convert "443/tcp -> 0.0.0.0:40001" to "443 tcp 0.0.0.0 40001"
	docker port "$1" | sed -re 's#[/>: -]+# #g' | \
		while read localport proto addr containerport ; do
			iptables --wait -t nat -A DOCKER ! -i docker0 -p "$proto" --dport "$containerport" -j DNAT --to-destination "$IP:$localport"
			iptables --wait -t filter -A DOCKER -d "$IP/32" ! -i docker0 -o docker0 -p "$proto" --dport "$localport" -j ACCEPT
			iptables --wait -t nat -A POSTROUTING -s "$IP/32" -d "$IP/32" -p "$proto" --dport "$localport" -j MASQUERADE
		done
}

if [ -x /usr/bin/docker ] && [ -z "$(ucr get docker/container/uuid)" ] && pidof dockerd >/dev/null; then
	# this is a docker host
	nat_core_rules

	for CONT_ID in $(docker ps -q); do
		nat_container_rule "$CONT_ID"
	done
fi
