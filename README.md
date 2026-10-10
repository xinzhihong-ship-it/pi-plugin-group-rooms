# Group Rooms standalone plugin

The plugin adds a Group Rooms category after Sessions and Projects in the main
sidebar. Create and Join open a React management page in the main content area.
Room rows open managed native sessions; the native composer remains the only
chat entry. Members use the existing WorkPanel view.

The Extensions toggle owns this UI. Disabling unregisters navigation, pages and
the native `@` autocomplete, returns an active management page to chat, and
retains room data and native history. Re-enabling restores the room list. The
composer itself carries no plugin controls: who runs is decided by the
`@mention` the user types, and a message with no `@` at all runs on **this
computer** — the same as `@`-ing yourself. A message that names somebody else
runs only them. Hosting is
receiving: creating a room or an invitation arms the listener, a saved host room
re-arms it on activation (rebinding the remembered port), and leaving the last
hosted room retires it. A machine that hosts nothing stays network inert on
activation, and no listening switch exists anywhere in the UI.

Each computer chooses its own accessible project directory. Mount a NAS before
selecting its local mount path. Model and thinking configuration are saved per
member, separately from selected recipients. Configuration does not execute an
agent or change another computer's global model settings.

## Local execution

Each targeted computer runs its agent in a local worker session created with
the configured model and thinking level. Permission cards, Ask prompts and
credentials stay on that computer. The worker runs at **this machine's own
configured default permission mode**: the plugin never calls
`session/configure`, because the host re-confirms that dangerous operation
natively on every call and a per-run call becomes one dialog per room message.
The user owns that mode in Settings. Worker sessions are not deleted
automatically; they remain in the local sidebar as execution records.
Disconnected or interrupted runs are recorded as unknown and never replayed.

A room transcript itself is a managed chat session that never runs an agent, so
it binds **no host project** and creates none. Creating a project for it (or
binding the session to one) made a project appear in the sidebar the moment a
room was opened, because the host promotes a session's project path into the
sidebar's project tabs; a plugin cannot un-promote it. The room stays in the
plugin's own navigation, and each worker's folder travels with its own
`session/create` request.

## Known behavior to note

An assistant with no saved model configuration runs on **its own computer's
default model**. `@all` therefore just sends: no member has to be configured
first, and no send is refused for a missing choice. Each member's model and
thinking level is published to the room, so the members page shows what every
other computer is running on, including one this machine never configured.

An **explicitly saved** configuration stays strict. An unknown model key, an
unsupported thinking level, or a saved model that has since left the catalog is
still refused rather than silently replaced — the fallback never stands in for a
choice you made on purpose.

Joining a room **asks for agent access in the same step**: a member that stays
chat-only is the usual reason an `@mention` gets no reply, and the machine's own
user has already consented by joining. The request lands as `pending` until the
host approves it.

Creating a room **approves only the host's own member row**. The machine that
creates the room *is* the host and its user is the highest authority in the
room, so making them click 「批准助手」 on themselves is a self-approval that was
removed. Every other member, including one that joins and auto-requests, still
lands as `pending` until the host approves it.

Removing a member is **visible on that member's own screen**. A removed machine
keeps the room and its history but is no longer a member, so the core reports
`revoked: true` alongside the room; the navigation row, the main page card and
the Members panel all read 「已被移出房间」 instead of the plain 「已断开」 a
temporary network problem shows, the card explains that the host removed it, and
a send is refused with the same wording. The core never re-dials the host for a
removed room.

An agent reply **states the model and thinking level it ran on**, and **its
author is colored**. The host renders a managed message's author as a byline and
has no model column of its own, so the admitted run's choice rides in that
byline: a reply reads `🔵 Alice · Claude Sonnet · high`. The dot in front of the
name is picked by a stable hash of the member name, so the same member keeps the
same color on every computer and after a restart — the host escapes markup, so
an emoji is the only color available to a byline. The palette is the seven
chromatic circles; black and white are deliberately absent, because a black disc
on a dark transcript reads as a byline the plugin never colored. Seven colors
still spread a realistic roster of machine names evenly (each entry within a
point of 14%). The run records its own choice, so an older reply keeps stating
what it actually ran on even after the member's selection changes. A member with
no admitted model keeps the bare name.

## A long conversation does not blind the `@` list

Every room answer is polled through the host's `plugin.call` relay, which refuses
an answer past 64 KB. A room transcript is the plugin's own durable record, and
after a few dozen messages it alone passed that limit, so `snapshot` started
failing on every 1.2s poll: the page read no room, cleared it, and the `@` list
came back empty. `snapshot` and `list` now answer with one trimmed projection —
history and worker log dropped (no view draws them; the transcript is rendered
from the host), the run journal cut to the newest 20 and any run still marked
`running` reported as `unknown`. The live room on this machine measured 196840
bytes before and 8398 after. A poll answer no longer grows with how long a room
has been talking.

## Composer model follows this machine's member

A room transcript is a managed session, and the host creates those with no model
bound, so the composer's model chip used to fall back to the app default no
matter what the member page said. The plugin now writes **this machine's own
member choice** onto the managed session through a narrow, non-dangerous host
API (`session.setManagedModel`), and the chip follows it. It is written when the
room is created or joined, when this machine's own member is reconfigured, and
once per saved room on activation, so the chip is already right after a restart.

The choice has **two records, and both count**. A local configuration is what
this machine sends with, so it wins. The member row's synced `selection` is the
copy the room published, and it is the only record a machine has when the choice
was made on another computer — configuring the Windows member from the Mac is
exactly that case, and reading only the local file left that machine's chip stuck
on the app default. Every persisted room snapshot therefore re-checks this
machine's own selection and re-states it when it changed.

Only an **explicitly saved** choice is written: a member with none already runs
on this machine's default model, which is the same thing the chip would show, so
writing it would be a call that changes nothing. An unchanged binding is never
written twice — a room persists on every message and every peer sync, and
restating the same model would be a host call per message. A host without the
API simply leaves the chip on the default; the room keeps working.

## Images and files cross machines

The host content-addresses a composer attachment before it reaches the plugin, so
a room message carries only a small descriptor (`attachments/<sha256>`, name,
kind, mime type, size) — never the bytes, because a room message is capped at
100000 bytes and the history at 512 KiB. A message with an attachment and no text
is valid: a picture can be sent with no caption.

The bytes move out of band, chunked at 256 KiB through the host, which is the
only machine everyone is connected to. Every member pulls a blob it does not
hold and stores it content-addressed on disk, then re-announces the message so
the native transcript re-renders and the picture appears. The `@mentioned`
machine's worker gets the attachment as a content-addressed prompt path, so a
vision model reads the image exactly as it would in an ordinary session.

The picture also **stays where you put it**. The composer writes an image the
same way an ordinary session does — an `@"<path>"` marker inside the message
text — and the host reports that marker as the attachment's `inlinePath`, which
is what the transcript uses to draw the image between the words it sat between.
That marker is not a person, so the room reads mentions from the message with
every attachment's own marker removed: `@all 这是什么游戏` plus a screenshot runs
`@all` instead of failing with 「Mention must identify exactly one room member」.
A quoted `@path` you typed by hand is untouched and is still refused.

A read that finds nothing is the **fetch trigger**, not a failure. The host
reports a blob it does not hold by *throwing* `NOT_FOUND` — never by returning a
falsy value — so the core reads it that way: a throw means "not on this machine
yet, go and get it". Read as a fatal error instead, the one machine that lacked
the bytes aborted the transfer, which is why a picture used to run on the
sender's own computer (it holds the blob) and fail on every other one with
「助手没能完成这次回复」, leaving that member stuck. The same read backs the
relay, so a machine asked for a blob it does not hold forwards the request to
the sender rather than answering with an error.

Transfer failures never block a message: a message whose bytes cannot be fetched
still appears, and the bytes can be fetched later. A single attachment is capped
at 50 MB (the WebSocket frame limit is 1 MiB, so anything larger is chunked), and
a message carries at most 32 attachments; going over either limit is reported,
not silently dropped. A room message's attachments are part of the durable
transcript, so a reload renders the same picture.

## This machine remembers its own name and address

Create and Join used to start blank every time: the member name lived only in
the page's memory, and the reachable address had to be typed by hand. Both are
now **remembered on this machine and prefilled**. The name comes from a room's
own member row when one exists — the strongest record — and otherwise from the
name last used. The address is the one this machine last handed out, and when
there is none, the plugin probes its own interfaces and offers the **first
non-loopback IPv4**. Every address field stays editable, because a machine with
several NICs (Wi-Fi plus Ethernet, a NAS or VPN adapter) may probe the wrong
one; what you type is what is remembered. Only a room that was actually created
or joined is remembered, so a mistyped address on a failed attempt is never what
the next form offers.

## Room rows carry an action menu

Each room in the sidebar's Group Rooms list has a `…` button that appears on
hover, exactly like a native session row. Its menu offers **Open session**,
**Room members**, **Rename** and **Create invitation** (host only), **Leave
room**, and **Delete room**. Rename and Create invitation open a small inline
form right there instead of sending you to the management page.

The menu is drawn inside a host **plugin layer** (`pi.ui.openLayer()`), not
directly on `document.body`. That is not cosmetic: plugin styles are wrapped in
`@scope ([data-pi-plugin="…"])` and the layer element is what carries that
attribute, so a body portal would render with no styling at all — an invisible
menu.

**Delete** means leave the room *and* erase this machine's copy of its chat:
the room is left, then the native room session is deleted. The host shows its
own dangerous-operation confirmation for that delete, so deleting asks twice —
once in the menu and once from the host — and that is deliberate. If you cancel
the host's dialog the room is still gone (leaving already happened) and the
session is left behind for you to remove from the ordinary sidebar. Deleting
does **not** wait for that dialog: the room is left the moment you confirm in
the menu, and the session delete settles in the background, so a dialog you
leave open for a while cannot stall the plugin. A deleted room is **not**
rejoined into its old session: a guest that leaves normally keeps its session so
a rejoin resumes the same conversation, but a delete drops that record, so
joining again with a fresh invitation starts a new room session rather than
handing back the one just erased.

**Create invitation…** copies the invitation to the clipboard in the same step
and says so. This is the whole point of the row-menu form: it runs while you are
in the sidebar with the management page not even mounted, so an invitation that
only lands in a text box you cannot see would never reach the other computer. If
the clipboard refuses, the page says so instead of claiming a copy, and the
page's own 「复制」 button is still there to do it by hand.

The answer is drawn **where the action was taken**. The row menu lives in the
sidebar, and a report written only to the management page is invisible from
there — which is exactly how the copy looked like it never happened. The
sidebar therefore carries the same line, and it clears itself after ten seconds;
a stale confirmation parked under the room list reads as a current state rather
than a message about a finished action.

## Create and Join land in the room

Submitting Create or Join now opens the new room's native session in the same
step, instead of leaving you on the management page to click 「打开会话」 a second
time. Opening a session needs no click gesture of its own, so this is safe even
though the creation itself was asynchronous.

Arriving in a room also opens the **members panel** beside the chat, so who is
in the room and what each of them runs on is visible immediately. The host only
permits a plugin to open that panel from inside a real user gesture, and
finishing a Create or Join is asynchronous with no gesture attached, so the
panel opens on your **first click or key press after the switch**; if you close
it, it stays closed. It can also be opened on demand from the `成员` chip on the
selected row, from **Room members** in the `…` menu, or from 「房间成员」 on the
room's card in the management page. The chip and the row's `…` button share the
row's right corner, so the chip appears on the same hover as the button. Both
keep a box of their own in the row's flex line — the button is `position:
relative` with `flex: 0 0 auto`, not an absolute overlay — because an overlay
takes no width: the chip could reserve a margin for a column that was not
actually there and end up painted under the button. As siblings in the flex
line, neither can sit on the other however narrow the row gets.

## A pending assistant raises a prompt

When another machine's assistant is waiting for this host to admit it, the room
row shows a `待批准` chip **and** a dialog appears with **稍后 / 拒绝 / 批准**.
批准 and 拒绝 act immediately; 稍后 dismisses the dialog for that member and it
does not reappear for the rest of the session, while the chip keeps the request
findable. This is the same decision the members panel offers — the prompt just
makes sure the host sees it without hunting for it. The prompt is drawn on an
opaque panel with the plugin's own button styling: it floats over the chat, and
it is the one thing on screen that has to stay readable.

## A settled turn never blocks the next message

A turn that ends without the host's durable receipt stays marked `unknown` in
the room, and the room refuses later messages to that member until something
releases it. When that turn was this machine's own worker giving up — its
session was deleted, its prompt was refused — nothing else can ever release it,
and every later message reports 「Agent already has an active or uncertain run」.
The plugin now releases exactly that case: once for each saved room at start-up,
and again just before a send. A run the worker is still tracking is never
released, because that guard is what stops a possibly-live turn from being
started twice.

A run aimed at a member on **another** computer has no such local release path:
the worker that could have settled it is gone, and the plugin only owns this
machine's own row. So the core retires that member's leftover `running`/`unknown`
records the moment the member **reconnects** — a fresh connection cannot be
mid-turn from before, which is the one proof the old turn is dead. Without it, a
member whose peer connection merely dropped (the other app closed or restarted)
stayed refused forever, even after coming back online; the room kept reporting
「Agent already has an active or uncertain run」 for that member and no message to
them could be sent. If this machine happens to be executing one of the retired
turns, it is stopped as well, so nothing is left running in the background.

## Compatibility and delivery

This implementation requires the public host APIs for managed native
transcripts, private secrets, agent-event subscriptions, native WorkPanel
actions, and main navigation/page slots — that is **PI-Desktop 0.18.0-beta.2**,
which is the installed app. Stock 0.17.0 does not supply these APIs. The
room-row menu also uses `pi.ui.openLayer()` and `workPanel.openView`, both of
which exist from beta.2.

Stock PluginCheck rejects the new permissions `session.manage.own` and
`secrets.store`. The pending host checkout's public `pi-plugin check` accepts
them, and this package was built with that checkout's `pi-plugin pack`. It
installs only on a host that contains those APIs; no such release exists yet.
The host changes remain in an isolated SDK worktree; the installed application
has not been replaced. GitHub authentication blocks publishing the authorized
host PR.

## Verification

The actual plugin passed an isolated macOS Desktop test against the pending SDK
checkout: main category order, Create/Join page switching, backend room creation,
native room opening and broadcast, a singleton Members WorkPanel tab, removal
on disable, and room/history preservation after re-enable and restart. The room
was absent from ordinary session rows. This test made zero model requests.
Only the copied test manifest lowered its engine requirement to match the
unreleased checkout; the deliverable manifest was not lowered.

Backend, shared-helper and main UI tests passed 54/54 (backend 45, shared 4,
UI 5), including the room-row menu, the remembered name/address,
delete-then-rejoin, the pending-approval prompt with the members-panel
auto-open, the invitation-copies-on-generation path, the delete that does not
wait for the host's dialog, and the release of a settled `unknown` run. Two
further tests stand up real in-memory room services over loopback. One sends an
attachment from a machine holding the bytes to one that does not, and asserts the
receiver fetched them and ran with the attachment; against the previous bundle it
fails with the room's own log line, `attachment blob is not stored on this
machine`, and the guest never receives the bytes, while against this bundle it
passes byte for byte. The other drops a member's connection mid-run, confirms the
room then refuses them, restarts that member's service on the same stored room,
and asserts its stale `unknown` record is retired and the room takes a message to
them again; against the previous bundle the member comes back online still
blocked. The menu
tests assert the menu is **inside the plugin layer and carries the plugin id the
host scopes styles to**, not merely present in the DOM — the gap that let an
unstyled, invisible menu ship.

A visible-window run on the packaged app then covered the menu, the approval
prompt and the members panel across two machines (26 stages PASS). Every menu
and dialog assertion is on **rendered geometry** — size, visibility, opacity,
computed background and border, `fixed` positioning — not on a node existing.
That run caught three defects this repository's unit tests could not: the
enter-the-room one-shot registered one handler for two event kinds, so a single
click fired it twice and the host's singleton view tab reopened empty, leaving
the members view unrendered; the menu's layout effect omitted the layer from its
dependencies, so the portal target did not exist on the only pass that measured
it and the menu was never clamped into the viewport or flipped above a row near
the bottom edge; and the one-shot was armed on the resolved room, which a 1.2s
poll is needed to know, so a user's first press on arrival spent it before the
plugin could. All three are fixed. The portable core's own room tests passed 70/70 (network 28,
extension 7, runtime 4, renderer gating 7, mentions 3, room index 21). Host plugin, queue,
scheduled-workspace, tray and slot-layout regressions passed 98/98; desktop type
checking and production build passed.

Two isolated Desktop instances on one Mac (host and guest) passed actual
network execution with a local SSE fixture provider: independent member
configuration, live remote presentation, one `@all` message producing two
durable completed runs from the same canonical message, `high` thinking
delivered to the guest model, a read tool on each computer's own project path
with unique plugin-scoped tool IDs, single final bubbles, durable `aborted`
settlement when the guest disabled the plugin mid-run, and no replay after
re-enabling. Five fixture model requests were made.

Both Desktop runs were repeated against the exact final host commit
`5d7fb6f36`: main interface run `1791527106424` (10 stages) and network run
`1791527124115` (7 stages) passed.

Running the plugin in a visible Desktop window reproduced a main-page layout
defect: the page collapsed into a padded sliver and its own container query
fired at the narrowest breakpoint. It was a host slot-layout gap, fixed
generally in host commit `e454405b9` and defensively in this plugin's
`.gr-page` / `.gr-nav` rules. The same walkthrough then completed Create, Join,
assistant approval, per-member model and thinking selection and an `@all`
message that produced one final message per computer from its own local
`README.md`. Physical multi-computer, cross-OS and real remote permission-card
acceptance have not been completed.

The bundled portable network service is `lib/network.cjs`. Rebuild it from the
preserved candidate core with `node build.mjs <candidate-worktree>`; build-time
patches in `lib/core-patches.cjs` use strict source anchors.
