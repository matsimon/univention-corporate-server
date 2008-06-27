#!/bin/sh
#
# Univention Thin Client X.org Base
#  wait for the univention-client process and run scripts in
#  /usr/lib/univention-thin-client-session-scripts
#
# Copyright (C) 2007 Univention GmbH
#
# http://www.univention.de/
#
# All rights reserved.
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License version 2 as
# published by the Free Software Foundation.
#
# Binary versions of this file provided by Univention to you as
# well as other copyrighted, protected or trademarked materials like
# Logos, graphics, fonts, specific documentations and configurations,
# cryptographic keys etc. are subject to a license agreement between
# you and Univention.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.	See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA	 02110-1301	 USA

eval $(univention-baseconfig shell thinclient/session/scripts/timeout)

if [ -z "$thinclient_session_scripts_timeout" ]; then
	thinclient_session_scripts_timeout="20"
fi

( i=0
while sleep 5 && test $i -lt 12; do
	if pidof univention-client; then
		# until session setup is finished
		sleep $thinclient_session_scripts_timeout
		run-parts /usr/lib/univention-thin-client-session-scripts
		exit 0
	fi
	i=$((i+1))
done ) &

exit 0
