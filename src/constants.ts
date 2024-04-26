/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

export interface MSG_PAYLOAD {
  action: string
  data: unknown
  frame?: string
}

export type VALIDATION_STATUS = 'success' | 'warning' | 'error'

export const MSG_C2PA_INSPECT_URL = 'MSG_C2PA_INSPECT_URL'
export const MSG_DISPLAY_C2PA_OVERLAY = 'MSG_DISPLAY_C2PA_OVERLAY'
export const MSG_UPDATE_FRAME_HEIGHT = 'MSG_UPDATE_FRAME_HEIGHT'
export const MSG_VALIDATE_URL = 'MSG_VALIDATE_URL'
export const MSG_PARENT_RESPONSE = 'MSG_PARENT_RESPONSE'
export const MSG_CHILD_REQUEST = 'MSG_CHILD_REQUEST'
export const MSG_GET_CONTAINER_OFFSET = 'MSG_GET_CONTAINER_OFFSET'
export const MSG_GET_TAB_ID = 'MSG_GET_TAB_ID'
export const MSG_INSPECT_URL = 'MSG_INSPECT_URL'
export const MSG_L3_INSPECT_URL = 'MSG_L3_INSPECT_URL'
export const MSG_REMOTE_INSPECT_URL = 'MSG_REMOTE_INSPECT_URL'
export const MSG_CHECK_TRUSTLIST_INCLUSION = 'MSG_CHECK_TRUSTLIST_INCLUSION'
export const MSG_GET_TRUSTLIST_INFOS = 'MSG_GET_TRUSTLIST_INFOS'
export const MSG_ADD_TRUSTLIST = 'MSG_ADD_TRUSTLIST'
export const MSG_REMOVE_TRUSTLIST = 'MSG_REMOVE_TRUSTLIST'
export const MSG_FRAME_CLICK = 'MSG_FRAME_CLICK'
export const MSG_REQUEST_C2PA_ENTRIES = 'MSG_REQUEST_C2PA_ENTRIES'
export const MSG_RESPONSE_C2PA_ENTRIES = 'MSG_RESPONSE_C2PA_ENTRIES'
export const MSG_TRUSTLIST_UPDATE = 'MSG_TRUSTLIST_UPDATE'
export const DEFAULT_MSG_TIMEOUT = 5000 /* 5 sec */
export const REMOTE_VALIDATION_LINK = 'https://contentintegrity.microsoft.com/check'
export const AWAIT_ASYNC_RESPONSE = true

export const CR_ICON_SIZE = '2em'
export const CR_ICON_Z_INDEX = 10000
export const CR_ICON_MARGIN_LEFT = 35
export const CR_ICON_MARGIN_TOP = 5
export const OVERLAY_Z_INDEX = 10001

export const MIME = {
  C2PA: 'application/c2pa',
  APPLICATION_MP4: 'application/mp4',
  X_C2PA_MANIFEST_STORE: 'application/x-c2pa-manifest-store',
  AUDIO_MP4: 'audio/mp4',
  MPEG: 'audio/mpeg',
  VND_WAVE: 'audio/vnd.wave',
  WAV: 'audio/wav',
  X_WAV: 'audio/x-wav',
  AVIF: 'image/avif',
  HEIC: 'image/heic',
  HEIF: 'image/heif',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  SVG_XML: 'image/svg+xml',
  TIFF: 'image/tiff',
  WEBP: 'image/webp',
  X_ADOBE_DNG: 'image/x-adobe-dng',
  X_SONY_ARW: 'image/x-sony-arw',
  MP4: 'video/mp4',
  X_MSVIDEO: 'video/x-msvideo',
  PDF: 'application/pdf'
}
