import type { IpcChannels } from './ipc'

// Runtime whitelist of invoke channels. Mapped from keyof IpcChannels so that
// adding a new channel to IpcChannels without listing it here is a compile error.
export const INVOKE_CHANNELS: { readonly [K in keyof IpcChannels]: true } = {
  'request:send': true,
  'project:load': true,
  'project:create': true,
  'project:list': true,
  'project:list-collections': true,
  'project:delete': true,
  'collection:create': true,
  'collection:delete': true,
  'request:load': true,
  'request:save': true,
  'request:create': true,
  'request:delete': true,
  'request:rename': true,
  'node:move': true,
  'env:list': true,
  'env:save': true,
  'env:delete': true,
  'history:list': true,
  'history:save': true,
  'history:clear': true,
  'history:clear-for-request': true,
  'dialog:open-folder': true,
  'dialog:open-file': true,
  'import:postman': true,
  'import:postman-environments': true,
  'import:postman-collection': true,
  'workspace:list': true,
  'workspace:add': true,
  'workspace:remove': true,
  'workspace:create': true,
  'workspace:get-last': true,
  'workspace:set-last': true,
  'git:is-repo': true,
  'git:branch': true,
  'git:fetch': true,
  'git:ahead-behind': true,
  'git:pull': true,
  'git:status': true,
  'git:commit': true,
  'git:push': true,
  'updater:check': true,
  'updater:download': true,
  'updater:install': true,
  'updater:get-status': true
}

export type InvokeChannel = keyof IpcChannels

export const EVENT_CHANNELS = {
  'updater:status': true
} as const

export type EventChannel = keyof typeof EVENT_CHANNELS

export function isInvokeChannel(channel: string): channel is InvokeChannel {
  return Object.prototype.hasOwnProperty.call(INVOKE_CHANNELS, channel)
}

export function isEventChannel(channel: string): channel is EventChannel {
  return Object.prototype.hasOwnProperty.call(EVENT_CHANNELS, channel)
}
