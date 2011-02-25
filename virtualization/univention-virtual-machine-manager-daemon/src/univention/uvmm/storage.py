#!/usr/bin/python
# -*- coding: utf-8 -*-
#
# Univention Virtual Machine Manager Daemon
#  storage handler
#
# Copyright 2010 Univention GmbH
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
"""UVMM storage handler.

This module implements functions to handle storage on nodes. This is independent from the on-wire-format.
"""

import libvirt
import logging
from xml.dom.minidom import getDOMImplementation, parseString
from helpers import TranslatableException, N_ as _
import os.path
import univention.config_registry as ucr

configRegistry = ucr.ConfigRegistry()
configRegistry.load()

logger = logging.getLogger('uvmmd.storage')

class StorageError(TranslatableException):
	"""Error while handling storage."""
	pass

def create_storage_pool(conn, dir, pool_name='default'):
	"""Create directory pool."""
	# FIXME: support other types than dir
	xml = '''
	<pool type="dir">
		<name>%(pool)s</name>
		<target>
			<path>%(path)s</path>
		</target>
	</pool>
	''' % {
			'pool': pool_name,
			'path': dir,
			}
	try:
		p = conn.storagePoolDefineXML(xml, 0)
		p.setAutostart(True)
		p.create( 0 )
	except libvirt.libvirtError, e:
		logger.error(e)
		raise StorageError(_('Error creating storage pool "%(pool)s" for "%(domain)s": %(error)s'), pool=pool_name, domain=domain.name, error=e.get_error_message())

def create_storage_volume(conn, domain, disk):
	"""Create disk for domain."""
	try:
		# BUG #19342: does not find volumes in sub-directories
		v = conn.storageVolLookupByPath(disk.source)
		logger.warning('Reusing existing volume "%s" for domain "%s"' % (disk.source, domain.name))
		return v
	except libvirt.libvirtError, e:
		logger.info( 'create_storage_volume: libvirt error (%d): %s' % ( e.get_error_code(), str( e ) ) )
		if not e.get_error_code() in ( libvirt.VIR_ERR_INVALID_STORAGE_VOL, libvirt.VIR_ERR_NO_STORAGE_VOL ):
			raise StorageError(_('Error locating storage volume "%(volume)s" for "%(domain)s": %(error)s'), volume=disk.source, domain=domain.name, error=e.get_error_message())

	pool = (0, None)
	for pool_name in conn.listStoragePools() + conn.listDefinedStoragePools():
		try:
			p = conn.storagePoolLookupByName(pool_name)
			xml = p.XMLDesc(0)
			doc = parseString(xml)
			path = doc.getElementsByTagName('path')[0].firstChild.nodeValue
			if '/' != path[-1]:
				path += '/'
			if disk.source.startswith(path):
				l = len(path)
				if l > pool[0]:
					pool = (l, p)
		except libvirt.libvirtError, e:
			if e.get_error_code() != libvirt.VIR_ERR_NO_STORAGE_POOL:
				logger.error(e)
				raise StorageError(_('Error locating storage pool "%(pool)s" for "%(domain)s": %(error)s'), pool=pool_name, domain=domain.name, error=e.get_error_message())
		except IndexError, e:
			pass
	if not pool[0]:
		logger.warning('Volume "%(volume)s" for "%(domain)s" in not located in any storage pool.' % {'volume': disk.source, 'domain': domain.name})
		return None # FIXME
		#raise StorageError(_('Volume "%(volume)s" for "%(domain)s" in not located in any storage pool.'), volume=disk.source, domain=domain.name)
		#create_storage_pool(conn, path.dirname(disk.source))
	l, p = pool
	try:
		p.refresh(0)
		v = p.storageVolLookupByName(disk.source[l:])
		logger.warning('Reusing existing volume "%s" for domain "%s"' % (disk.source, domain.name))
		return v
	except libvirt.libvirtError, e:
		logger.info( 'create_storage_volume: libvirt error (%d): %s' % ( e.get_error_code(), str( e ) ) )
		if not e.get_error_code() in (libvirt.VIR_ERR_INVALID_STORAGE_VOL, libvirt.VIR_ERR_NO_STORAGE_VOL):
			raise StorageError(_('Error locating storage volume "%(volume)s" for "%(domain)s": %(error)s'), volume=disk.source, domain=domain.name, error=e.get_error_message())

	if hasattr(disk, 'size') and disk.size:
		size = disk.size
	else:
		size = 8 << 30 # GiB

	values = {
			'name': os.path.basename(disk.source),
			'size': size,
			}

	# determin pool type
	xml = p.XMLDesc(0)
	doc = parseString(xml)
	pool_type = doc.firstChild.getAttribute('type')
	if pool_type == 'dir':
		if hasattr(disk, 'driver_type') and disk.driver_type not in (None, 'iso', 'aio'):
			values['type'] = disk.driver_type
		else:
			values['type'] = 'raw'
		# permissions
		permissions = '<permissions>\n'
		found = True
		for access in ( 'owner', 'group', 'mode' ):
			value = configRegistry.get( 'uvmm/volume/permissions/%s' % access, None )
			if value:
				permissions += '<%(tag)s>%(value)s</%(tag)s>\n' % { 'tag' : access, 'value' : value }
				found = True
		if found:
			permissions += '</permissions>'
		else:
			permissions = ''

		template = '''
		<volume>
			<name>%%(name)s</name>
			<allocation>0</allocation>
			<capacity>%%(size)ld</capacity>
			<target>
				<format type="%%(type)s"/>
				%s
			</target>
		</volume>
		''' % permissions
	elif pool_type == 'logical':
		template = '''
		<volume>
			<name>%(name)s</name>
			<capacity>%(size)ld</capacity>
		</volume>
		'''
	else:
		logger.error("Unsupported storage-pool-type %s for %s:%s" % (pool_type, domain.name, disk.source))
		raise StorageError(_('Unsupported storage-pool-type "%(pool_type)s for "%(domain)s"'), pool_type=pool_type, domain=domain.name)

	xml = template % values
	try:
		logger.debug('XML DUMP: %s' % xml)
		v = p.createXML(xml, 0)
		logger.info('New disk "%s" for "%s"(%s) defined.' % (v.path(), domain.name, domain.uuid))
		return v
	except libvirt.libvirtError, e:
		if e.get_error_code() in (libvirt.VIR_ERR_NO_STORAGE_VOL,):
			logger.warning('Reusing existing volume "%s" for domain "%s"' % (disk.source, domain.name))
			return None
		logger.error(e)
		raise StorageError(_('Error creating storage volume "%(name)s" for "%(domain)s": %(error)s'), name=disk.source, domain=domain.name, error=e.get_error_message())

def get_storage_volumes( uri, pool_name, type = None ):
	from node import Disk, node_query

	node = node_query( uri )
	try:
		pool = node.conn.storagePoolLookupByName(pool_name)
		pool.refresh(0)
	except libvirt.libvirtError, e:
		logger.error(e)
		raise StorageError(_('Error listing pools at "%(uri)s": %(error)s'), uri=uri, error=e.get_error_message())
	volumes = []
	for name in pool.listVolumes():
		disk = Disk()
		vol = pool.storageVolLookupByName( name )
		xml = vol.XMLDesc( 0 )
		doc = parseString( xml )
		disk.size = int( doc.getElementsByTagName( 'capacity' )[ 0 ].firstChild.nodeValue )
		target = doc.getElementsByTagName( 'target' )[ 0 ]
		disk.source = target.getElementsByTagName( 'path' )[ 0 ].firstChild.nodeValue
		try: # Only directory-based pools have /volume/format/@type
			disk.driver_type = target.getElementsByTagName('format')[0].getAttribute('type')
			disk.type = Disk.TYPE_FILE
			if disk.driver_type == 'iso':
				disk.device = Disk.DEVICE_CDROM
			else:
				disk.device = Disk.DEVICE_DISK
		except IndexError, e:
			disk.type = Disk.TYPE_BLOCK
			disk.device = Disk.DEVICE_DISK
			disk.driver_type = None # raw
		if not type or Disk.map_device( disk.device ) == type:
			volumes.append( disk )

	return volumes

def get_all_storage_volumes(conn, domain):
	"""Retrieve all referenced storage volumes."""
	volumes = []
	doc = parseString(domain.XMLDesc(0))
	devices = doc.getElementsByTagName('devices')[0]
	disks = devices.getElementsByTagName('disk')
	for disk in disks:
		source = disk.getElementsByTagName('source')[0]
		volumes.append(source.getAttribute('file'))
	return volumes

def destroy_storage_volumes(conn, volumes, ignore_error=False):
	"""Destroy volumes."""
	# 1. translate names into references
	refs = []
	for name in volumes:
		try:
			ref = conn.storageVolLookupByPath(name)
			refs.append(ref)
		except libvirt.libvirtError, e:
			if ignore_error:
				logger.warning("Error translating '%s' to volume: %s" % (name, e.get_error_message()))
			else:
				logger.error("Error translating '%s' to volume: %s. Ignored." % (name, e.get_error_message()))
				raise
	# 2. delete them all
	for volume in refs:
		try:
			volume.delete(0)
		except libvirt.libvirtError, e:
			if ignore_error:
				logger.warning("Error deleting volume: %s" % e.get_error_message())
			else:
				logger.error("Error deleting volume: %s. Ignored." % e.get_error_message())
				raise

def get_storage_pool_info( node, name ):
	from protocol import Data_Pool
	p = node.conn.storagePoolLookupByName( name )
	xml = p.XMLDesc( 0 )
	doc = parseString( xml )
	pool = Data_Pool()
	pool.name = name
	pool.uuid = doc.getElementsByTagName( 'uuid' )[ 0 ].firstChild.nodeValue
	pool.capacity = int( doc.getElementsByTagName( 'capacity' )[ 0 ].firstChild.nodeValue )
	pool.available = int( doc.getElementsByTagName( 'available' )[ 0 ].firstChild.nodeValue )
	pool.path = doc.getElementsByTagName( 'path' )[ 0 ].firstChild.nodeValue
	pool.active = p.isActive() == 1
	pool.type = doc.firstChild.getAttribute('type') # pool/@type

	return pool

def storage_pools( uri = None, node = None ):
	"""List all pools."""
	from node import node_query

	try:
		if uri and not node:
			node = node_query( uri )
		conn = node.conn
		pools = []
		for name in conn.listStoragePools() + conn.listDefinedStoragePools():
			pool = get_storage_pool_info( node, name )
			pools.append( pool )
		return pools
	except libvirt.libvirtError, e:
		logger.error(e)
		raise StorageError(_('Error listing pools at "%(uri)s": %(error)s'), uri=uri, error=e.get_error_message())
