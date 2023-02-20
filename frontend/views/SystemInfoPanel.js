var kind = require('enyo/kind'),
  Divider = require('moonstone/Divider'),
  Spinner = require('moonstone/Spinner'),
  Scroller = require('moonstone/Scroller'),
  LabeledTextItem = require('moonstone/LabeledTextItem'),
  ToggleItem = require('moonstone/ToggleItem'),
  LunaService = require('enyo-webos/LunaService'),
  Panel = require('moonstone/Panel');

module.exports = kind({
  name: 'SystemInfoPanel',
  kind: Panel,
  title: 'System Information',
  headerType: 'small',
  deviceInfo: {},
  osInfo: {},
  interfaces: {},
  components: [
    { kind: Spinner, name: 'spinner', content: 'Loading...', center: true, middle: true },
    {
      kind: LunaService,
      name: 'getInfo',
      service: 'luna://org.webosbrew.hbchannel.service',
      method: 'exec',
      onResponse: 'onGetInfo',
      onError: 'onGetInfo',
    },

    {
      kind: Scroller,
      fit: true,
      components: [
        {
          classes: 'moon-hspacing top',
          components: [
            {
              components: [
                { kind: Divider, content: 'OS Information' },
                { kind: LabeledTextItem, label: 'Software Version', name: 'softwareVersion' },
                { kind: LabeledTextItem, label: 'webOS Name', name: 'webosName' },
                { kind: LabeledTextItem, label: 'webOS Version', name: 'webosVersion' },
                { kind: LabeledTextItem, label: 'webOS Build Timestamp', name: 'webosBuildTimestamp' },
                { kind: LabeledTextItem, label: 'Kernel Version', name: 'kernelVersion' },
              ],
              classes: 'moon-7h',
            },
            {
              components: [
                { kind: Divider, content: 'Hardware Information' },
                { kind: LabeledTextItem, label: 'Board Type', name: 'boardType' },
                { kind: LabeledTextItem, label: 'Firmware Model Name', name: 'hardwareId' },
                { kind: LabeledTextItem, label: 'Model Name', name: 'productId' },
                { kind: LabeledTextItem, label: 'Storage Size', name: 'storageSize' },
                { kind: LabeledTextItem, label: 'RAM Size', name: 'ramSize' },
              ],
              classes: 'moon-7h',
            },
            {
              components: [
                { kind: ToggleItem, name: 'showPrivate', content: 'Show private identifiers' },
                {
                  name: 'privateInfo',
                  components: [
                    { kind: LabeledTextItem, label: 'Serial Number', name: 'serialNumber' },
                    { kind: LabeledTextItem, label: 'NDUID', name: 'nduid' },
                    { kind: LabeledTextItem, label: 'Ethernet MAC', name: 'ethernetMAC' },
                    { kind: LabeledTextItem, label: 'Wireless MAC', name: 'wirelessMAC' },
                  ],
                  showing: false,
                },
              ],
              classes: 'moon-8h',
            },
          ],
        },
      ],
    },
  ],

  bindings: [
    {
      from: 'deviceInfo',
      to: '$.spinner.showing',
      transform: function () {
        return this.osInfo && this.modelInfo;
      },
    },
    {
      from: 'modelInfo',
      to: '$.spinner.showing',
      transform: function () {
        return this.osInfo && this.modelInfo;
      },
    },

    { from: 'osInfo.webos_manufacturing_version', to: '$.softwareVersion.text' },
    {
      from: 'osInfo',
      to: '$.webosVersion.text',
      transform: function (v) {
        return v.core_os_release + ' (' + v.core_os_release_codename + ')';
      },
    },
    { from: 'osInfo.webos_name', to: '$.webosName.text' },
    { from: 'osInfo.webos_build_datetime', to: '$.webosBuildTimestamp.text' },
    { from: 'osInfo.core_os_kernel_version', to: '$.kernelVersion.text' },
    { from: 'deviceInfo.board_type', to: '$.boardType.text' },
    { from: 'deviceInfo.hardware_id', to: '$.hardwareId.text' },
    { from: 'deviceInfo.product_id', to: '$.productId.text' },
    { from: 'deviceInfo.storage_size', to: '$.storageSize.text' },
    { from: 'deviceInfo.ram_size', to: '$.ramSize.text' },

    { from: '$.showPrivate.checked', to: '$.privateInfo.showing' },
    { from: 'deviceInfo.serial_number', to: '$.serialNumber.text' },
    { from: 'deviceInfo.nduid', to: '$.nduid.text' },

    {
      from: 'interfaces.wlan0',
      to: '$.wirelessMAC.text',
      transform: function (v) {
        if (v) return v.mac + (v.ipv4 ? ' (' + v.ipv4 + ')' : '');
      },
    },
    {
      from: 'interfaces.eth0',
      to: '$.ethernetMAC.text',
      transform: function (v) {
        if (v) return v.mac + (v.ipv4 ? ' (' + v.ipv4 + ')' : '');
      },
    },

    { from: 'deviceInfo.wifi_addr', to: '$.wirelessMAC.text' },
    { from: 'deviceInfo.wired_addr', to: '$.ethernetMAC.text' },
  ],
  create: function () {
    this.inherited(arguments);
    console.info('Create! Sending requests');
    this.$.getInfo.send({ command: 'cat /var/run/nyx/device_info.json' });
    this.$.getInfo.send({ command: 'cat /var/run/nyx/os_info.json' });
    this.$.getInfo.send({
      command:
        'for n in /sys/class/net/*; do echo "$(basename $n) $(cat $n/address) $(ifconfig $(basename $n) | awk "/inet / {print \\$2}" | head -n 1)"; done',
    });
  },
  onGetInfo: function (sender, response) {
    console.info(sender, response);

    if (response.errorText && response.errorText.indexOf('Invalid device for Palm services. PalmServiceBridge not found.') !== -1) {
      this.set('deviceInfo', {
        board_type: 'K3LP_DVB',
        device_name: 'k3lp',
        hardware_id: 'HE_DTV_W17P_AFADABAA',
        hardware_revision: 'BOARD_DV_1ST',
        keyboard_type: 'virtual',
        modem_present: 'N',
        nduid: 'dummy',
        product_id: '43UX1234-ZA',
        ram_size: '1.5 GB',
        serial_number: 'DUMMYSERIAL',
        storage_size: '4 GB',
        wifi_addr: '04:00:11:22:33:44',
      });
      this.set('osInfo', {
        core_os_kernel_version: '4.4.3-p.613.dunggir.k3lp.3',
        core_os_name: 'Rockhopper',
        core_os_release: '3.8.0-61312',
        core_os_release_codename: 'dreadlocks2-dunggir',
        encryption_key_type: 'prodkey',
        webos_api_version: '4.1.0',
        webos_build_datetime: '20191205042547',
        webos_build_id: '61312',
        webos_imagename: 'starfish-dvb-secured',
        webos_manufacturing_version: '05.80.50',
        webos_name: 'webOS TV Lite',
        webos_prerelease: '',
        webos_release: '3.8.0',
        webos_release_codename: 'dreadlocks2-dunggir',
      });
    } else if (response.returnValue == true && response.stdoutString) {
      var command = response.originator.params.command;
      if (command.indexOf('ifconfig') !== -1) {
        var interfaces = {};
        response.stdoutString.split('\n').forEach(function (l) {
          if (l.trim().length) {
            var parts = l.trim().split(' ');
            var iface = {
              ifname: parts[0],
              mac: parts[1],
              ipv4: parts[2] ? parts[2].split(':')[1] : null,
            };
            interfaces[iface.ifname] = iface;
          }
        });
        console.info('interfaces:', interfaces);
        if (interfaces.wlan0 || interfaces.eth0) {
          this.set('interfaces', interfaces);
        }
      } else {
        var target = command.indexOf('device_info') !== -1 ? 'deviceInfo' : 'osInfo';
        var str = response.stdoutString;
        var parsed = {};
        try {
          parsed = JSON.parse(str);
        } catch (err) {
          console.info('failed, attempting mstar workaround...');
          // mstar fuckery
          parsed = JSON.parse(str.substr(0, str.lastIndexOf('\n', str.length - 2)));
        }
        console.info(target, parsed);
        this.set(target, parsed);
      }
    }
  },
});
