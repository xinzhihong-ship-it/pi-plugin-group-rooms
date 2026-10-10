# Standalone plugin compatibility

Delivery is an independent plugin using public SDK interfaces. The Extensions
switch controls the Group Rooms main navigation category, the main management
page and the native `@` autocomplete. Members remain in the existing WorkPanel.

## Stock PI-Desktop 0.17.0

The installed version supplies desktop operations, model catalogs, WorkPanel
views and additive composer slots. It lacks the managed native submission and
transcript APIs, private plugin secrets, execution-event subscriptions, managed
live presentation and main-shell page/navigation APIs required here. It cannot
run this implementation through its verified public SDK.

The stock PluginCheck also rejects `session.manage.own` and `secrets.store`.
A validated `.piplug` has not been produced. Do not remove required permissions
or substitute private IPC calls to make this checker pass.

## Pending host implementation

The isolated host worktree implements these general plugin capabilities:

- Managed native transcript ownership, submit receipts and idempotent append.
- A narrow, non-dangerous managed-session model binding
  (`session.setManagedModel`) that writes only the model columns and can never
  touch `mode`/`permission_mode`/transcript — unlike `session/configure`, which
  is dangerous and re-prompts natively on every call.
- Managed-session attachments: the host content-addresses a composer attachment
  and hands the owning plugin a descriptor, plus owner-checked
  `readManagedAttachment` / `beginManagedAttachment` / `writeManagedAttachment` /
  `commitManagedAttachment` so a plugin can move the bytes to another machine and
  land them in its own content-addressed store. The managed-send path reads the
  session's project path with `session.get {id}` and no read window, because
  host-core refuses a zero-length window (`messageLimit: 0` → "non-negative
  messageBefore and positive messageLimit"), which failed every managed send.
- Encrypted plugin-private secret storage.
- Per-session agent streams and durable terminal receipts.
- Owner-checked transient message/tool presentation.
- Native session context and singleton WorkPanel view actions.
- Lifecycle-owned `navigationSection` and `mainPage` slots with gesture-bound
  `shell.openPage`; disabling removes slots and exits an active plugin page.

The manifest requires `>=0.18.0-beta.2`, which **is** the installed
application: it already carries `pi.ui.openLayer`, the `@scope`-wrapped style
injection, `workPanel.openView` and the `#pi-plugin-layers` stack. This round
therefore needs no host change and ships as a plugin-only `.piplug`.

## Verified scope

The actual plugin passed an isolated macOS Desktop main-interface acceptance
run against that pending checkout. It verified Sessions / Projects / Group
Rooms order, Create/Join form navigation, real backend room creation, native
chat opening and broadcast, singleton Members tab, no ordinary session-row
duplication, disable removal, and room/history preservation across re-enable
and application restart. Listener activation remained explicit. Zero model
requests were made. Only the isolated copied manifest used a beta.2 engine
override for the test checkout.

Backend, shared-helper and main UI tests passed 58/58
(backend 45, shared 4, UI 5, plus four harnesses that drive two real room
services over loopback). The loopback harnesses: one sends an attachment from a
machine holding the bytes to one that does not and asserts the receiver fetched
them and ran with the attachment; one drops a member's connection mid-run and
asserts its stale `unknown` record is retired when it reconnects; one leaves and
rejoins, asserting the re-flushed window is appended once and the member list
does not grow; and one rejoins *after a hard drop* (no clean leave) and asserts
the offline ghost row is retired rather than duplicated. The last three fail
against the previous bundle; the remember-identity/address,
delete-then-rejoin,
pending-approval-prompt and members-panel auto-open paths are also covered by a
visible-window run on the packaged app (26 stages PASS, two machines), whose
menu and dialog assertions read rendered geometry rather than DOM presence. That
run caught three defects the unit tests could not — a double-firing one-shot
that left the members view unrendered, a menu layout effect that never measured
its portal, and a one-shot armed on the resolved room rather than the active
session, so the user's first press on arrival spent it before the plugin could
know the room — all now fixed. The
portable core's room tests passed 70/70; host plugin, queue,
scheduled-workspace, tray and slot-layout regressions passed 98/98. Desktop
type checking and production build passed. Two isolated instances on one Mac
passed network execution with a local fixture provider: two durable completed
runs from one `@all` message, per-computer project paths, `high` thinking,
unique tool IDs, durable abort on disable and no replay on re-enable. Against
the exact host commit `5d7fb6f36`, the main interface run `1791527106424` and
network run `1791527124115` both passed. The pending checkout's `pi-plugin
check` accepts this plugin. Physical multi-computer, cross-OS and real remote
permission-card acceptance remain outstanding.

A visible-window run reproduced a main-page layout defect: the page collapsed
into a padded sliver and its container query fired at the narrowest breakpoint,
and the navigation section sized to its content instead of spanning the
sidebar. This was a general host slot gap, fixed in host commit `e454405b9`
(`mainPage` and `navigationSection` now take their host box) and defensively in
the plugin's `.gr-page` / `.gr-nav` rules. The same run then completed Create,
Join, assistant approval, per-member model and thinking selection and an `@all`
message that produced one final message per computer from its own local
`README.md`.

Known behavior to note: an assistant with no saved configuration runs on its own
computer's default model, so `@all` no longer refuses a send over a missing
choice and no `INTERNAL` failed turn appears. The earlier refusal
(`Select a model for every available @all agent first`) is gone. An explicitly
saved configuration is still strict: an unknown model key, an unsupported
thinking level, or a saved model no longer in the catalog is refused.

Creating a room approves **only the host's own member row**: the creating
machine is the host, so a self-approval click was removed. Every other member,
including one that joins and auto-requests agent access, still lands as
`pending` until the host approves. An agent reply states the model and thinking
level it ran on: the admitted run's choice rides in the managed author byline
(`🔵 Alice · Claude Sonnet · high`), since the host transcript has no model column
of its own. The name carries a colored dot chosen by a stable hash of the name,
so a member is the same color on every computer; the palette is the seven
chromatic circles, black and white excluded because a black disc on a dark
transcript reads as an uncolored byline. The composer carries no plugin
controls — the native `@` autocomplete is the only addition, and who runs is
decided by the `@mention` the user types: a message with no `@` runs on this
computer, and one that names somebody else runs only them.

Worker sessions are created and prompted through `desktop.control`
operations. `session/configure` is a dangerous operation that always shows the
host's native confirmation, with no persistence between calls, so the plugin
**never** calls it: a worker runs at this machine's own configured default
permission mode. Calling it on every run to narrow the mode is what turned one
room message into one native consent dialog. For the same reason a room
transcript binds **no host project** — it is a managed chat session that never
runs an agent, and creating a project for it made a project appear in the user's
sidebar that they never asked for. The member's folder travels with each worker
request instead, and `session/create` is what gives that worker its workspace.

## Plugin-side additions

This round adds no host API. The plugin remembers its own member name and
reachable address in its private settings (a new top-level `local` field, with a
migration that leaves an older document intact), probes its own interfaces with
`node:os` for a first non-loopback IPv4 to offer, and deletes a room with the
already-available `session/open` and `session/delete` desktop operations. The
room-row menu is a portal into a **`pi.ui.openLayer()` layer**, built inside the
plugin, because the sidebar clips its rows and the host's own context-menu
component is not exposed to plugins — and because plugin CSS is wrapped in
`@scope ([data-pi-plugin="…"])`, so a portal to `document.body` would arrive
with no styling at all. The layer is zero-sized and fixed, so the menu still
positions against the row's viewport rect. The members panel is opened through
`workPanel.openView` from the user's own gesture only. Generating an invitation
copies it immediately, through the renderer's clipboard API with a
detached-field command copy as fallback, so the row-menu form works with the
management page unmounted; a refusal is reported as a refusal, and the report is
drawn in the sidebar as well as on the management page, since that is where the
row menu is used. Deleting a room
dispatches `session/delete` without awaiting it, because the host's dangerous
confirmation dialog can outlast the 2s `plugin.call` relay timeout, and five
consecutive poll timeouts trip the relay breaker and make the plugin read as
「连续出错」 for 30s. The approval dialog restates the opaque
`--ds-bg-elevated-opaque` surface and styles its own buttons, since the host's
`.p-dialog` shell is translucent and styles none. Five build-time core patches
add `forgetDeparted`, `forgetRunStatus`, a blob-read fix, a reconnect
retirement and a ghost-member retirement on join, so a deleted session is not
handed back by a later rejoin, a run this machine's own worker settled as
`unknown` does not refuse every later message to that member forever, a blob
this machine does not hold is *fetched* rather than treated as a fatal read
error, and a member whose connection dropped is not left permanently refused
after coming back. A machine only leaves cleanly while its link is up: if a
guest's app was relaunched and its stored room was lost (reinstall, cleared
data), it rejoins with a fresh credential while its old row is still on the host,
offline — and the join used to add a second row for the same name that nothing
ever retired, so the members list grew one ghost per rejoin, on both machines,
because a guest's view *is* the host's snapshot. A join now retires every
offline row carrying the joining name (a name is one computer's identity here)
together with its credential, and marks its still-`running` runs `unknown`; a
clean rejoin is matched by its credential as before and never re-joins. The host reports a missing blob by
throwing `NOT_FOUND`, never with a falsy value; the core's two blob paths assumed
the falsy shape, so a picture raised on a room ran only on the machine that held
the bytes and failed — with a stuck member and 「助手没能完成这次回复」 — on
every other one, and the relay refused instead of forwarding. A run the host
recorded `unknown` for a *remote* member had no release path at all (the plugin's
own release covers only this machine's row), so a peer that merely went away and
came back stayed blocked; the host now retires that member's leftover
`running`/`unknown` records on `resume`, because reconnecting is the one proof
the old turn is dead. The bundled portable service is rebuilt from the unchanged
candidate core.

## Portable network build

`node build.mjs <candidate-worktree>` bundles the preserved room network core
and WebSocket dependency into `lib/network.cjs`, with strict build-time adapter
patches. No candidate-checkout paths are needed by the bundle at runtime.
Backend activation reads storage and registers event handlers; it never prompts,
reconnects or binds for a machine that hosts nothing. A saved host room does
re-arm its listener, because hosting a room is what makes the machine reachable;
the port and bind address are remembered so invitations already shared keep
working.
