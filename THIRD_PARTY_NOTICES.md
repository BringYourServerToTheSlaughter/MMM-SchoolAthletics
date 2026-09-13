# Third-party notices

MMM-SchoolAthletics project source code is licensed under the MIT License.
See [LICENSE](LICENSE).

## Direct dependencies

The project uses the following third-party packages under their respective
licenses:

| Dependency | Version | License | Source |
| --- | --- | --- | --- |
| acorn | 8.15.0 | MIT | https://github.com/acornjs/acorn |
| cheerio | 1.2.0 | MIT | https://github.com/cheeriojs/cheerio |
| ipaddr.js | 2.3.0 | MIT | https://github.com/whitequark/ipaddr.js |
| node-ical | 0.27.1 | Apache-2.0 | https://github.com/jens-maus/node-ical |
| sharp | 0.35.4 | Apache-2.0 | https://github.com/lovell/sharp |

Those packages, their transitive dependencies, and their notices remain subject
to their respective licenses. Transitive dependencies, including Sharp's
platform binaries and libvips components, may carry additional licenses.
Preserve the applicable notices when distributing a bundled installation.
`package-lock.json` records the dependency tree.

node-ical documents its origins in Peter Braden's ical.js project and retains
its own attribution and licensing information.

## MagicMirror

MagicMirror² is a separate project. MMM-SchoolAthletics uses MagicMirror's
documented module APIs, including `Module.register`, lifecycle hooks, socket
notifications, and `NodeHelper.create`. MagicMirror source code is not vendored
in this repository.

## ArbiterSports

ArbiterSports is a separate service. MMM-SchoolAthletics is not affiliated with
or endorsed by ArbiterSports.

## Logos, trademarks, and branding

School names, mascots, logos, trademarks, and other third-party branding remain
the property of their respective owners. Automatic logo discovery or caching
does not assign a license to those images.

Downloaded opponent logos and production calendar data are not distributed as
part of the source repository.

The PingState name and logo, including `setup/assets/pingstate.png`, are not
licensed under the MMM-SchoolAthletics MIT License.

The preview image at `docs/assets/mmm-schoolathletics-preview.png` may depict
school names, logos, mascots, or other third-party marks. Those marks and the
preview image are not licensed for reuse under the MMM-SchoolAthletics MIT
License.
