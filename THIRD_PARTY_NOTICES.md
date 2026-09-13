# Provenance and third-party components

The initial three source files were supplied by the maintainer as copies of a working production school-athletics module. No copyright or license notices were present in those supplied files. Original authorship and any earlier copied/adapted implementations must be verified by the maintainer before public release. No project-wide license is asserted here.

Before selecting a project license, the maintainer must verify who authored the supplied JavaScript, CSS, and node helper; whether any portions came from MagicMirror or another project; the original licenses and required notices for any such portions; and that the relevant rights holders authorize redistribution under the proposed license. The repository's current history does not resolve those questions. No `LICENSE` is added, and `package.json` remains `UNLICENSED` pending verification.

The refactor uses MagicMirror's documented module APIs (`Module.register`, lifecycle hooks, socket notifications, `NodeHelper.create`). Using those APIs does not establish that source code was copied from MagicMirror. No MagicMirror source is vendored here.

Direct dependencies (installed by npm, with original licenses retained in their packages; Acorn is used only by the optional setup helper):

| Dependency | Version | License | Source |
| --- | --- | --- | --- |
| acorn | 8.15.0 | MIT | https://github.com/acornjs/acorn |
| node-ical | 0.27.1 | Apache-2.0 | https://github.com/jens-maus/node-ical |
| cheerio | 1.2.0 | MIT | https://github.com/cheeriojs/cheerio |
| ipaddr.js | 2.3.0 | MIT | https://github.com/whitequark/ipaddr.js |
| sharp | 0.35.4 | Apache-2.0 | https://github.com/lovell/sharp |

Transitive dependencies, including Sharp's platform binaries/libvips, carry their own licenses and notices in the installed packages. Preserve those notices if distributing a bundled installation; `package-lock.json` records the dependency tree. node-ical documents its origins in Peter Braden's ical.js project and includes its own attribution.

School names, trademarks, and logos remain associated with their respective owners. Automatic logo caching does not assign a license to those images. No discovered logos or production calendar data are included in the source tree or test fixtures.
