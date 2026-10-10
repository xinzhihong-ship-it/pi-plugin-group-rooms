// Scoped to the two public main-shell slots; host semantic tokens remain authoritative.
export const mainStyle = `
.gr-nav,.gr-page{color:var(--ds-text-primary);font:inherit;min-width:0;box-sizing:border-box}
.gr-nav *,.gr-page *{box-sizing:border-box}
.gr-nav{flex:none;width:100%;align-self:stretch;padding:4px 0 8px}
.gr-nav .sidebar-list-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gr-nav .sidebar-list-label{flex:1;min-width:0}
.gr-nav-heading{font:inherit;color:inherit;text-align:left;background:transparent;border:0;padding:4px;cursor:pointer}
.gr-nav-actions{display:flex;gap:4px;flex-wrap:wrap;padding:4px 8px}
.gr-nav-actions button{font:inherit;font-size:12px;color:var(--ds-text-secondary);border:0;border-radius:var(--radius-sm,6px);background:transparent;padding:4px 8px;cursor:pointer}
.gr-nav .thread-item{overflow:hidden;min-width:0;transition:none}
.gr-nav .thread-item-main{font:inherit;background:transparent;border:0;cursor:pointer;flex:1 1 auto;white-space:normal;min-width:0}
.gr-nav .thread-item-title{white-space:normal;overflow:visible;overflow-wrap:anywhere;flex:1;text-overflow:clip}
.gr-nav .gr-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--ds-text-faint);margin:0 4px}
.gr-nav .gr-dot.online{background:var(--ds-success,var(--ds-focus))}
/* A removed machine is not merely offline, so its dot must not read as one. */
.gr-nav .gr-dot.revoked{background:var(--ds-danger,var(--ds-text-muted))}
.gr-nav-status{font-size:12px;color:var(--ds-text-muted);padding:4px 12px;overflow-wrap:anywhere}
/* The room row gets the same hover-revealed "more" affordance a native session
 * row has. The row itself stays the open button; this only appears on hover or
 * keyboard focus so a quiet sidebar is not covered in dots. The action column is
 * in the row's flex line, not absolutely overlaid on it — the host's own
 * the host's own sidebar-row-actions is an inline-flex column for exactly this reason. An
 * overlay takes no width, so the chip beside it had nothing to keep clear of and
 * the two boxes overlapped; as a flex item the column takes its 26px out of the
 * title and the chip simply sits before it. */
.gr-nav .gr-row-actions{position:relative;display:inline-flex;align-items:center;flex:0 0 auto;opacity:0;pointer-events:none;transition:opacity 120ms ease}
.gr-nav .thread-item:hover .gr-row-actions,.gr-nav .thread-item:focus-within .gr-row-actions{opacity:1;pointer-events:auto}
.gr-nav .gr-row-more{font:inherit;font-size:14px;line-height:1;color:var(--ds-text-secondary);background:var(--ds-bg-secondary,transparent);border:0;border-radius:var(--radius-sm,6px);padding:2px 6px;cursor:pointer}
.gr-nav .gr-row-more:hover{background:var(--ds-bg-hover)}
/* The way into the room's members panel, on the row of the room it belongs to.
 * It is the one chip that shares the row with the hover-revealed more button, so
 * it reveals on the same hover. The action column is a flex item that keeps its
 * own width (see gr-row-actions), so the chip needs no reserved margin — it
 * is simply the item before the column and can never sit under it. */
.gr-nav .gr-row-members{font-size:11px;line-height:1.4;color:var(--ds-text-secondary);border:1px solid var(--ds-border-default);border-radius:10px;padding:1px 8px;flex:none;cursor:pointer;opacity:0;transition:opacity 120ms ease}
.gr-nav .thread-item:hover .gr-row-members,.gr-nav .thread-item:focus-within .gr-row-members{opacity:1}
.gr-nav .gr-row-members:hover{background:var(--ds-bg-hover);color:var(--ds-text-primary)}
.gr-nav .gr-row-members:focus-visible{outline:2px solid var(--ds-focus);outline-offset:2px}
/* A pending request is the host's to answer, so the sidebar says so where the
 * room is even after the dialog was waved away. */
.gr-nav .gr-row-pending{font-size:11px;line-height:1.4;color:var(--ds-danger,var(--ds-text-primary));border:1px solid var(--ds-danger,var(--ds-border-strong));border-radius:10px;padding:1px 8px;flex-shrink:0;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* The dialog borrows the host's .p-dialog shell, whose surface is
 * --ds-bg-elevated — a deliberately translucent panel that reads as unreadable
 * over the chat behind it. The approval card is the one thing the host must be
 * able to read, so it gets the opaque surface and its buttons get the styling
 * the host's tool classes do not carry. Both selectors name .p-dialog too: the
 * host's rule has the same specificity, and which stylesheet lands last is not
 * this plugin's to decide. */
.gr-approval.p-dialog{background:var(--ds-bg-elevated-opaque,var(--ds-bg-primary));max-width:min(440px,92vw)}
.gr-approval .p-dialog-head{color:var(--ds-text-primary);font-weight:600}
.gr-approval p{color:var(--ds-text-secondary)}
.gr-approval .p-dialog__foot{flex-wrap:wrap}
.gr-approval .p-dialog__foot button{font:inherit;font-size:12px;min-height:32px;padding:6px 12px;border:1px solid var(--ds-border-strong);border-radius:var(--radius-md,8px);background:var(--ds-bg-primary);color:var(--ds-text-primary);cursor:pointer}
.gr-approval .p-dialog__foot button:hover{background:var(--ds-bg-hover)}
.gr-approval .p-dialog__foot button.primary{background:var(--ds-text-primary);color:var(--ds-bg-primary);border-color:var(--ds-text-primary)}
.gr-approval .p-dialog__foot button:focus-visible{outline:2px solid var(--ds-focus);outline-offset:2px}
/* Portalled to <body>: the sidebar clips overflow, so a menu left in the row
 * would be cut off. Fixed positioning resolves against the viewport because no
 * ancestor sets a transform today. */
.gr-menu{position:fixed;z-index:60;min-width:180px;max-width:280px;display:flex;flex-direction:column;gap:2px;padding:4px;border:1px solid var(--ds-border-strong);border-radius:var(--radius-md,8px);background:var(--ds-bg-primary);box-shadow:0 8px 24px rgba(0,0,0,.28)}
.gr-menu button{font:inherit;font-size:12px;text-align:left;color:var(--ds-text-primary);background:transparent;border:0;border-radius:var(--radius-sm,6px);padding:8px 10px;cursor:pointer;white-space:normal}
.gr-menu button:hover{background:var(--ds-bg-hover)}
.gr-menu button:disabled{opacity:.48;cursor:default}
.gr-menu button.danger{color:var(--ds-danger,var(--ds-text-primary))}
.gr-menu-sep{height:1px;margin:4px 2px;background:var(--ds-border-default)}
.gr-menu-form{gap:8px;padding:8px}
.gr-menu-form input{font:inherit;color:var(--ds-text-primary);background:var(--ds-bg-primary);border:1px solid var(--ds-border-strong);border-radius:var(--radius-md,8px);padding:8px;width:100%;min-width:0;min-height:32px}
.gr-menu :focus-visible{outline:2px solid var(--ds-focus);outline-offset:2px}
.gr-page{flex:1 1 auto;align-self:stretch;width:100%;height:100%;min-height:0;overflow:auto;padding:24px;container-type:inline-size;background:var(--ds-bg-primary)}
/* The host paints an opaque, absolute titlebar band over every route surface
 * and its own pages reserve it. A plugin mainPage is that band's sibling, so
 * it must reserve the same height or its first line is painted over. */
.gr-page{padding-top:calc(var(--ds-toolbar-height,46px) + 8px)}
.gr-page-inner{max-width:1000px;margin:0 auto;min-width:0}
.gr-page h1{font-size:20px;line-height:1.4;font-weight:600;margin:0}
.gr-page h2{font-size:14px;font-weight:600;margin:0 0 12px}
.gr-page h3{font-size:13px;font-weight:600;margin:0;overflow-wrap:anywhere}
.gr-page p{margin:4px 0 12px;color:var(--ds-text-muted);overflow-wrap:anywhere}
.gr-page-header,.gr-page-row{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
.gr-page-header{margin-bottom:24px}
.gr-page-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:24px;align-items:start}
.gr-page-section{border:1px solid var(--ds-border-default);background:var(--ds-bg-secondary);border-radius:var(--radius-lg,12px);padding:16px;min-width:0;margin-bottom:16px}
.gr-page-stack{display:grid;gap:12px;min-width:0}
.gr-page label{display:grid;gap:4px;min-width:0;color:var(--ds-text-secondary);font-size:12px}
.gr-page input,.gr-page textarea{font:inherit;color:var(--ds-text-primary);background:var(--ds-bg-primary);border:1px solid var(--ds-border-strong);border-radius:var(--radius-md,8px);padding:8px;width:100%;min-width:0;min-height:36px}
.gr-page textarea{min-height:96px;resize:vertical;overflow-wrap:anywhere}
.gr-page input[readonly]{color:var(--ds-text-muted)}
.gr-page button{font:inherit;font-size:12px;min-height:32px;padding:6px 12px;border:1px solid var(--ds-border-strong);border-radius:var(--radius-md,8px);background:var(--ds-bg-primary);color:var(--ds-text-primary);cursor:pointer;white-space:normal}
.gr-page button:hover,.gr-nav-actions button:hover,.gr-nav-heading:hover{background:var(--ds-bg-hover)}
.gr-page button:active,.gr-nav button:active{transform:translateY(1px)}
.gr-page button.primary,.gr-page button[aria-pressed=true]{background:var(--ds-text-primary);color:var(--ds-bg-primary)}
.gr-page button.danger{color:var(--ds-danger,var(--ds-text-primary))}
.gr-page button:disabled,.gr-nav button:disabled{opacity:.48;cursor:default;transform:none}
.gr-page :focus-visible,.gr-nav :focus-visible{outline:2px solid var(--ds-focus);outline-offset:3px}
.gr-page-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.gr-page-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.gr-page-small{font-size:12px;color:var(--ds-text-muted)}
.gr-page-notice{border:1px solid var(--ds-border-strong);border-radius:8px;padding:12px;margin-bottom:16px;overflow-wrap:anywhere}
.gr-page-notice.error{color:var(--ds-danger,var(--ds-text-primary))}
.gr-page-room{padding:16px 0;border-top:1px solid var(--ds-border-default);min-width:0;animation:gr-page-enter 180ms cubic-bezier(.2,.85,.25,1.12) both;animation-delay:var(--delay,0ms)}
.gr-page-room:first-child{border-top:0;padding-top:0}
.gr-page-room details{margin-top:8px;min-width:0}
.gr-page summary{font-size:12px;cursor:pointer;padding:8px 0;color:var(--ds-text-secondary)}
.gr-page details[open]>summary{margin-bottom:8px}
.gr-page-badge{font-size:11px;color:var(--ds-text-muted);border:1px solid var(--ds-border-default);border-radius:12px;padding:2px 8px}
.gr-page-badge.revoked{color:var(--ds-danger,var(--ds-text-primary));border-color:var(--ds-danger,var(--ds-border-strong))}
@keyframes gr-page-enter{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@container(max-width:680px){.gr-page-grid{grid-template-columns:minmax(0,1fr);gap:0}}
@media(max-width:600px){.gr-page{padding:16px;padding-top:calc(var(--ds-toolbar-height,46px) + 8px)}}
@media(prefers-reduced-motion:reduce){.gr-page-room{animation:none}.gr-page button:active,.gr-nav button:active{transform:none}}
`;
