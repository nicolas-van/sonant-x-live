// ------------------------------------------------------------------------------
// -*- mode: javascript; tab-width: 2; indent-tabs-mode: nil; -*-
// ------------------------------------------------------------------------------
// Sonant Live
//   A music tracker for the web.
//
// Copyright (c) 2011 Marcus Geelnard
//
// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.
//
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:
//
// 1. The origin of this software must not be misrepresented; you must not
//    claim that you wrote the original software. If you use this software
//    in a product, an acknowledgment in the product documentation would be
//    appreciated but is not required.
//
// 2. Altered source versions must be plainly marked as such, and must not be
//    misrepresented as being the original software.
//
// 3. This notice may not be removed or altered from any source
//    distribution.

// ------------------------------------------------------------------------------
// Local classes for easy access to binary data
// ------------------------------------------------------------------------------

import $ from 'jquery'
import gInstrumentPresets from './presets'
import * as sonantx from 'sonantx'
import * as LZString from 'lz-string'
import URI from 'urijs'
import _ from 'underscore'

import waveSinSel from './gui/wave-sin-sel.png'
import waveSqrSel from './gui/wave-sqr-sel.png'
import waveSawSel from './gui/wave-saw-sel.png'
import waveTriSel from './gui/wave-tri-sel.png'
import waveSin from './gui/wave-sin.png'
import waveSqr from './gui/wave-sqr.png'
import waveSaw from './gui/wave-saw.png'
import waveTri from './gui/wave-tri.png'
import boxCheck from './gui/box-check.png'
import boxUncheck from './gui/box-uncheck.png'
import progressPng from './gui/progress.gif'
import filtLp from './gui/filt-lp.png'
import filtLpSel from './gui/filt-lp-sel.png'
import filtHp from './gui/filt-hp.png'
import filtHpSel from './gui/filt-hp-sel.png'
import filtBp from './gui/filt-bp.png'
import filtBpSel from './gui/filt-bp-sel.png'
import filtN from './gui/filt-n.png'
import filtNSel from './gui/filt-n-sel.png'
import playGfxBg from './gui/playGfxBg.png'
import ledOff from './gui/led-off.png'
import ledOn from './gui/led-on.png'

const audioCtx = window.AudioContext ? new AudioContext() : null

// ------------------------------------------------------------------------------
// GUI class
// ------------------------------------------------------------------------------

const CGUI = function () {
  // Edit modes
  const EDIT_NONE = 0
  const EDIT_SEQUENCE = 1
  const EDIT_PATTERN = 2

  // Edit/gui state
  let mEditMode = EDIT_SEQUENCE
  let mKeyboardOctave = 5
  let mPatternRow = 0
  let mPatternRow2 = 0
  let mSeqCol = 0
  let mSeqRow = 0
  let mSeqCol2 = 0
  let mSeqRow2 = 0
  let mSelectingSeqRange = false
  let mSelectingPatternRange = false
  let mSeqCopyBuffer = []
  let mPatCopyBuffer = []

  // Resources
  let mSong = {}
  let mAudio = null
  let mAudioGenerator = null
  const mPlayGfxVUImg = new Image()
  const mPlayGfxLedOffImg = new Image()
  const mPlayGfxLedOnImg = new Image()

  // Constant look-up-tables
  const mNoteNames = [
    'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'
  ]

  const mBlackKeyPos = [
    20, 1, 46, 3, 72, 5, 110, 8, 138, 10, 178, 13, 204, 15, 230, 17, 270, 20,
    298, 22, 338, 25, 364, 27, 390, 29, 428, 32, 456, 34
  ]

  // Prealoaded resources
  const mPreload = []

  // --------------------------------------------------------------------------
  // Song import/export functions
  // --------------------------------------------------------------------------

  const calcSongLength = function (song) {
    return Math.round((song.endPattern * 32 + 8) * song.rowLen / 44100)
  }

  const calcSamplesPerRow = function (bpm) {
    return Math.round((60 * 44100 / 4) / bpm)
  }

  const getBPM = function () {
    return Math.round((60 * 44100 / 4) / mSong.rowLen)
  }

  const makeNewSong = function () {
    const song = {}

    // Row length
    song.rowLen = calcSamplesPerRow(120)
    // Last pattern to play
    song.endPattern = 2

    song.songData = []
    convertSong(song)

    return song
  }
  const convertSong = function (song) {
    let i, j, k
    for (i = 0; i < 8; i++) {
      let instr = song.songData[i]
      if (instr === undefined) {
        instr = {}
        // Oscillator 1
        instr.osc1_oct = 7
        instr.osc1_det = 0
        instr.osc1_detune = 0
        instr.osc1_xenv = 0
        instr.osc1_vol = 192
        instr.osc1_waveform = 0
        // Oscillator 2
        instr.osc2_oct = 7
        instr.osc2_det = 0
        instr.osc2_detune = 0
        instr.osc2_xenv = 0
        instr.osc2_vol = 192
        instr.osc2_waveform = 0
        // Noise oscillator
        instr.noise_fader = 0
        // Envelope
        instr.env_attack = 200
        instr.env_sustain = 2000
        instr.env_release = 20000
        instr.env_master = 192
        // Effects
        instr.fx_filter = 0
        instr.fx_freq = 11025
        instr.fx_resonance = 255
        instr.fx_delay_time = 0
        instr.fx_delay_amt = 0
        instr.fx_pan_freq = 0
        instr.fx_pan_amt = 0
        // LFO
        instr.lfo_osc1_freq = 0
        instr.lfo_fx_freq = 0
        instr.lfo_freq = 0
        instr.lfo_amt = 0
        instr.lfo_waveform = 0

        instr.p = []
        instr.c = []
        song.songData[i] = instr
      }

      // Patterns
      for (j = 0; j < 48; j++) {
        if (instr.p[j] === undefined) { instr.p[j] = 0 }
      }

      // Columns
      for (j = 0; j < 10; j++) {
        const col = instr.c[j]
        if (col === undefined) {
          const col2 = {}
          col2.n = []
          for (k = 0; k < 32; k++) {
            col2.n[k] = 0
          }
          instr.c[j] = col2
        }
      }
    }

    // Calculate song length (not really part of the binary song data)
    song.songLen = calcSongLength(song)
  }

  const compressSong = function (song) {
    song = _.clone(song)
    song.songData = _.map(song.songData, function (d) {
      d = _.clone(d)
      let lastNotZero = -1
      const used = []
      const usedIndex = {}
      // search the last pattern and listing all patterns
      _.each(d.p, function (p, i) {
        if (p !== 0) { lastNotZero = i }
        if (usedIndex[p] === undefined) {
          used.push(p)
          usedIndex[p] = true
        }
      })
      // remove useless end of pattern list
      d.p = d.p.slice(0, lastNotZero + 1)
      // remove unused patterns
      const lastPattern = _.max(used)
      d.c = d.c.slice(0, lastPattern)
      return d
    })
    song.songData = _.filter(song.songData, function (d) {
      return d.p.length > 0
    })
    return song
  }

  const songToJSON = function (song, pretty) {
    const csong = compressSong(song)
    return JSON.stringify(csong, null, pretty ? '    ' : undefined)
  }

  // --------------------------------------------------------------------------
  // Helper functions
  // --------------------------------------------------------------------------

  const preloadImage = function (url) {
    const img = new Image()
    img.src = url
    mPreload.push(img)
  }

  const initPresets = function () {
    const parent = document.getElementById('instrPreset')
    let o, instr
    for (let i = 0; i < gInstrumentPresets.length; ++i) {
      instr = gInstrumentPresets[i]
      o = document.createElement('option')
      o.value = instr.osc1_oct ? '' + i : ''
      o.appendChild(document.createTextNode(instr.name))
      parent.appendChild(o)
    }
  }

  const getElementPos = function (o) {
    let left = 0; let top = 0
    if (o.offsetParent) {
      do {
        left += o.offsetLeft
        top += o.offsetTop
        o = o.offsetParent
      } while (o)
    }
    return [left, top]
  }

  const getEventElement = function (e) {
    let o = null
    if (!e) { e = window.event }
    if (e.target) { o = e.target } else if (e.srcElement) { o = e.srcElement }
    if (o.nodeType === 3) {
      o = o.parentNode
    }
    return o
  }

  const getMousePos = function (e, rel) {
    // Get the mouse document position
    let p = [0, 0]
    if (e.pageX || e.pageY) {
      p = [e.pageX, e.pageY]
    } else if (e.clientX || e.clientY) {
      p = [e.clientX + document.body.scrollLeft +
           document.documentElement.scrollLeft,
      e.clientY + document.body.scrollTop +
           document.documentElement.scrollTop]
    }

    if (!rel) return p

    // Get the element document position
    const pElem = getElementPos(getEventElement(e))
    return [p[0] - pElem[0], p[1] - pElem[1]]
  }

  const unfocusHTMLInputElements = function () {
    document.getElementById('bpm').blur()
    document.getElementById('instrPreset').blur()
  }

  const setEditMode = function (mode) {
    mEditMode = mode

    // Set the style for the different edit sections
    document.getElementById('sequencer').className = (mEditMode === EDIT_SEQUENCE ? 'edit' : '')
    document.getElementById('pattern').className = (mEditMode === EDIT_PATTERN ? 'edit' : '')

    // Unfocus any focused input elements
    if (mEditMode !== EDIT_NONE) {
      unfocusHTMLInputElements()
    }
  }

  const updateSongInfo = function () {
    const bpm = getBPM()
    document.getElementById('bpm').value = bpm
  }

  const updateSequencer = function (scrollIntoView, selectionOnly) {
    let o
    // Update sequencer element contents and selection
    for (let i = 0; i < 48; ++i) {
      for (let j = 0; j < 8; ++j) {
        o = document.getElementById('sc' + j + 'r' + i)
        if (!selectionOnly) {
          const pat = mSong.songData[j].p[i]
          if (pat > 0) { o.innerHTML = '' + (pat - 1) } else { o.innerHTML = '' }
        }
        if (i >= mSeqRow && i <= mSeqRow2 &&
            j >= mSeqCol && j <= mSeqCol2) { o.className = 'selected' } else { o.className = '' }
      }
    }

    // Scroll the row into view? (only when needed)
    if (scrollIntoView) {
      o = document.getElementById('spr' + mSeqRow)
      if (o.scrollIntoView) {
        const so = document.getElementById('sequencer')
        const oy = o.offsetTop - so.scrollTop
        if (oy < 0 || (oy + 10) > so.offsetHeight) o.scrollIntoView(oy < 0)
      }
    }
  }

  const updatePattern = function () {
    const singlePattern = (mSeqCol === mSeqCol2 && mSeqRow === mSeqRow2)
    for (let i = 0; i < 32; ++i) {
      let noteName = ''
      const pat = singlePattern ? mSong.songData[mSeqCol].p[mSeqRow] - 1 : -1
      if (pat >= 0) {
        const n = mSong.songData[mSeqCol].c[pat].n[i] - 87
        if (n > 0) { noteName = mNoteNames[n % 12] + Math.floor(n / 12) }
      }
      const o = document.getElementById('pr' + i)
      o.innerHTML = noteName
      if (i >= mPatternRow && i <= mPatternRow2) { o.className = 'selected' } else { o.className = '' }
    }
  }

  const setSelectedPatternRow = function (row) {
    mPatternRow = row
    mPatternRow2 = row
    for (let i = 0; i < 32; ++i) {
      const o = document.getElementById('pr' + i)
      if (i === row) { o.className = 'selected' } else { o.className = '' }
    }
  }

  const setSelectedPatternRow2 = function (row) {
    mPatternRow2 = row >= mPatternRow ? row : mPatternRow
    for (let i = 0; i < 32; ++i) {
      const o = document.getElementById('pr' + i)
      if (i >= mPatternRow && i <= mPatternRow2) { o.className = 'selected' } else { o.className = '' }
    }
  }

  const setSelectedSequencerCell = function (col, row) {
    mSeqCol = col
    mSeqRow = row
    mSeqCol2 = col
    mSeqRow2 = row
    updateSequencer(true, true)
  }

  const setSelectedSequencerCell2 = function (col, row) {
    mSeqCol2 = col >= mSeqCol ? col : mSeqCol
    mSeqRow2 = row >= mSeqRow ? row : mSeqRow
    updateSequencer(false, true)
  }

  const addPatternNote = function (n) {
    // playNote
    if (mSong && mSong.songData[mSeqCol] && mSong.rowLen) {
      const sg = new sonantx.SoundGenerator(mSong.songData[mSeqCol], mSong.rowLen)
      if (!audioCtx) {
        sg.createAudio(n + 87, function (audio) {
          audio.play()
        })
      } else {
        sg.createAudioBuffer(n + 87, function (buffer) {
          const source = audioCtx.createBufferSource() // Create Sound Source
          source.buffer = buffer // Add Buffered Data to Object
          source.connect(audioCtx.destination) // Connect Sound Source to Output
          source.start()
        })
      }
    }
    // Edit pattern
    if (mEditMode === EDIT_PATTERN &&
        mSeqCol === mSeqCol2 && mSeqRow === mSeqRow2 &&
        mPatternRow === mPatternRow2) {
      const pat = mSong.songData[mSeqCol].p[mSeqRow] - 1
      if (pat >= 0) {
        mSong.songData[mSeqCol].c[pat].n[mPatternRow] = n + 87
        setSelectedPatternRow((mPatternRow + 1) % 32)
        updatePattern()
        return true
      }
    }
    return false
  }

  const updateSlider = function (o, x) {
    const props = o.sliderProps
    let pos = (x - props.min) / (props.max - props.min)
    pos = pos < 0 ? 0 : (pos > 1 ? 1 : pos)
    if (props.nonLinear) {
      pos = Math.sqrt(pos)
    }
    o.style.marginLeft = Math.round(191 * pos) + 'px'
  }

  const updateCheckBox = function (o, check) {
    o.src = check ? boxCheck : boxUncheck
  }

  const clearPresetSelection = function () {
    const o = document.getElementById('instrPreset')
    o.selectedIndex = 0
  }

  const updateInstrument = function (resetPreset) {
    const instr = mSong.songData[mSeqCol]

    // Oscillator 1
    document.getElementById('osc1_wave_sin').src = instr.osc1_waveform === 0 ? waveSinSel : waveSin
    document.getElementById('osc1_wave_sqr').src = instr.osc1_waveform === 1 ? waveSqrSel : waveSqr
    document.getElementById('osc1_wave_saw').src = instr.osc1_waveform === 2 ? waveSawSel : waveSaw
    document.getElementById('osc1_wave_tri').src = instr.osc1_waveform === 3 ? waveTriSel : waveTri
    updateSlider(document.getElementById('osc1_vol'), instr.osc1_vol)
    updateSlider(document.getElementById('osc1_oct'), instr.osc1_oct)
    updateSlider(document.getElementById('osc1_semi'), instr.osc1_det)
    updateSlider(document.getElementById('osc1_det'), instr.osc1_detune)
    updateCheckBox(document.getElementById('osc1_xenv'), instr.osc1_xenv)

    // Oscillator 2
    document.getElementById('osc2_wave_sin').src = instr.osc2_waveform === 0 ? waveSinSel : waveSin
    document.getElementById('osc2_wave_sqr').src = instr.osc2_waveform === 1 ? waveSqrSel : waveSqr
    document.getElementById('osc2_wave_saw').src = instr.osc2_waveform === 2 ? waveSawSel : waveSaw
    document.getElementById('osc2_wave_tri').src = instr.osc2_waveform === 3 ? waveTriSel : waveTri
    updateSlider(document.getElementById('osc2_vol'), instr.osc2_vol)
    updateSlider(document.getElementById('osc2_oct'), instr.osc2_oct)
    updateSlider(document.getElementById('osc2_semi'), instr.osc2_det)
    updateSlider(document.getElementById('osc2_det'), instr.osc2_detune)
    updateCheckBox(document.getElementById('osc2_xenv'), instr.osc2_xenv)

    // Noise
    updateSlider(document.getElementById('noise_vol'), instr.noise_fader)

    // Envelope
    updateSlider(document.getElementById('env_master'), instr.env_master)
    updateSlider(document.getElementById('env_att'), instr.env_attack)
    updateSlider(document.getElementById('env_sust'), instr.env_sustain)
    updateSlider(document.getElementById('env_rel'), instr.env_release)

    // LFO
    document.getElementById('lfo_wave_sin').src = instr.lfo_waveform === 0 ? waveSinSel : waveSin
    document.getElementById('lfo_wave_sqr').src = instr.lfo_waveform === 1 ? waveSqrSel : waveSqr
    document.getElementById('lfo_wave_saw').src = instr.lfo_waveform === 2 ? waveSawSel : waveSaw
    document.getElementById('lfo_wave_tri').src = instr.lfo_waveform === 3 ? waveTriSel : waveTri
    updateSlider(document.getElementById('lfo_amt'), instr.lfo_amt)
    updateSlider(document.getElementById('lfo_freq'), instr.lfo_freq)
    updateCheckBox(document.getElementById('lfo_o1fm'), instr.lfo_osc1_freq)
    updateCheckBox(document.getElementById('lfo_fxfreq'), instr.lfo_fx_freq)

    // Effects
    document.getElementById('fx_filt_lp').src = instr.fx_filter === 2 ? filtLpSel : filtLp
    document.getElementById('fx_filt_hp').src = instr.fx_filter === 1 ? filtHpSel : filtHp
    document.getElementById('fx_filt_bp').src = instr.fx_filter === 3 ? filtBpSel : filtBp
    document.getElementById('fx_filt_n').src = instr.fx_filter === 4 ? filtNSel : filtN
    updateSlider(document.getElementById('fx_freq'), instr.fx_freq)
    updateSlider(document.getElementById('fx_res'), instr.fx_resonance)
    updateSlider(document.getElementById('fx_dly_amt'), instr.fx_delay_amt)
    updateSlider(document.getElementById('fx_dly_time'), instr.fx_delay_time)
    updateSlider(document.getElementById('fx_pan_amt'), instr.fx_pan_amt)
    updateSlider(document.getElementById('fx_pan_freq'), instr.fx_pan_freq)

    // Clear the preset selection?
    if (resetPreset) { clearPresetSelection() }
  }

  const updateSongRanges = function () {
    let i, j, emptyRow

    // Determine the last song pattern
    mSong.endPattern = 49
    for (i = 47; i >= 0; --i) {
      emptyRow = true
      for (j = 0; j < 8; ++j) {
        if (mSong.songData[j].p[i] > 0) {
          emptyRow = false
          break
        }
      }
      if (!emptyRow) break
      mSong.endPattern--
    }

    // Determine song length
    mSong.songLen = calcSongLength(mSong)

    // Determine song speed
    const bpm = parseInt(document.getElementById('bpm').value, 10)
    if (bpm && (bpm > 40) && (bpm < 300)) {
      mSong.rowLen = calcSamplesPerRow(bpm)
    }
  }

  const showDialog = function () {
    const e = document.getElementById('cover')
    e.style.visibility = 'visible'
    deactivateMasterEvents()
  }

  const hideDialog = function () {
    const e = document.getElementById('cover')
    e.style.visibility = 'hidden'
    activateMasterEvents()
  }

  const showProgressDialog = function (msg) {
    const parent = document.getElementById('dialog')
    parent.innerHTML = ''

    // Create dialog content
    let o
    o = document.createElement('img')
    o.src = progressPng
    parent.appendChild(o)
    o = document.createTextNode(msg)
    parent.appendChild(o)

    showDialog()
  }

  const showOpenDialog = function () {
    const parent = document.getElementById('dialog')
    parent.innerHTML = ''

    // Create dialog content
    let o
    o = document.createElement('h3')
    parent.appendChild(o)
    o.appendChild(document.createTextNode('Import JSON'))
    parent.appendChild(document.createElement('br'))
    let el = $('<textarea id="jsonTextArea" style="width: 200px; height: 100px"></textarea>')
    o = el[0]
    parent.appendChild(o)
    parent.appendChild(document.createElement('br'))
    el = $('<button id="jsonImportButton">Import</button>')
    o = el[0]
    parent.appendChild(o)
    parent.appendChild(document.createTextNode(' '))
    el = $('<button id="jsonCancelButton">Cancel</button>')
    o = el[0]
    parent.appendChild(o)
    $('#jsonImportButton').click(function () {
      const json = $('#jsonTextArea').val()
      const song = JSON.parse(json)
      newSong(song)
      hideDialog()
    })
    $('#jsonCancelButton').click(function () {
      hideDialog()
    })

    showDialog()
  }

  const showUrlDialog = function (url) {
    const parent = document.getElementById('dialog')
    parent.innerHTML = ''

    // Create dialog content
    let o
    o = document.createElement('h3')
    parent.appendChild(o)
    o.appendChild(document.createTextNode('URL'))
    parent.appendChild(document.createElement('br'))
    let el = $('<input type="text" value="' + url + '"></input>')
    o = el[0]
    parent.appendChild(o)
    parent.appendChild(document.createElement('br'))
    el = $('<button id="urlExitButton">Exit</button>')
    o = el[0]
    parent.appendChild(o)
    $('#urlExitButton').click(function () {
      hideDialog()
    })

    showDialog()
  }

  // --------------------------------------------------------------------------
  // Event handlers
  // --------------------------------------------------------------------------

  const newSong = function (song) {
    if (song) {
      mSong = song
      convertSong(mSong)
    } else { mSong = makeNewSong() }

    // Update GUI
    updateSongInfo()
    updateSequencer()
    updatePattern()
    updateInstrument()

    // Initialize the song
    setEditMode(EDIT_SEQUENCE)
    setSelectedPatternRow(0)
    setSelectedSequencerCell(0, 0)
  }

  const openSong = function (e) {
    showOpenDialog()
    return false
  }

  const exportWAV = function (e) {
    // This can hog the browser for quite some time, so warn...
    if (!confirm('This can take quite some time. Do you want to continue?')) { return }

    // Update song ranges
    updateSongRanges()

    // Generate audio data
    const doneFun = function (wave) {
      const uri = 'data:application/octet-stream;base64,' + btoa(wave)
      window.open(uri)
    }
    generateAudio(doneFun)

    return false
  }

  const exportWAVRange = function (e) {
    // This can hog the browser for quite some time, so warn...
    if (!confirm('This can take quite some time. Do you want to continue?')) { return }

    // Update song ranges
    updateSongRanges()

    // Select range to play
    const opts = {
      firstRow: mSeqRow,
      lastRow: mSeqRow2,
      firstCol: mSeqCol,
      lastCol: mSeqCol2,
      numSeconds: ((mSeqRow2 - mSeqRow + 1) * 32 + 8) * mSong.rowLen / 44100
    }

    // Generate audio data
    const doneFun = function (wave) {
      const uri = 'data:application/octet-stream;base64,' + btoa(wave)
      window.open(uri)
    }
    generateAudio(doneFun, opts)

    return false
  }

  const exportJSON = function (e) {
    // Update song ranges
    updateSongRanges()

    // Generate JS song data
    const dataURI = 'data:text/javascript;base64,' + btoa(songToJSON(mSong, true))
    const link = document.createElement('a')
    link.setAttribute('download', 'sonant-x-export.json')
    link.setAttribute('href', dataURI)
    document.body.appendChild(link)
    link.click()
    setTimeout(
      function () {
        // Wait 1000ms before removing the link
        // This gives IE11 enough time to process the download (it will fail if the link is removed)
        document.body.removeChild(link)
      },
      1000
    )
    return false
  }

  const exportInstrument = function () {
    if (mSeqCol !== mSeqCol2 || mSeqCol < 0 || mSeqCol >= mSong.songData.length) {
      return
    }

    const instr = _.clone(mSong.songData[mSeqCol])
    delete instr.p
    delete instr.c

    const dataURI = 'data:text/javascript;base64,' + btoa(JSON.stringify(instr, null, '    '))
    const link = document.createElement('a')
    link.setAttribute('download', 'sonant-x-export-instrument.json')
    link.setAttribute('href', dataURI)
    document.body.appendChild(link)
    window.open(dataURI)
  }

  const exportURL = function (e) {
    // Update song ranges
    updateSongRanges()

    const json = songToJSON(mSong, false)
    const url = '' + new URI().fragment(URI.encode(LZString.compressToBase64(json)))
    showUrlDialog(url)

    return false
  }

  const setStatus = function (msg) {
    document.getElementById('statusText').innerHTML = msg
    //    window.status = msg;
  }

  const generateAudio = function (doneFun, opts) {
    // Show dialog
    showProgressDialog('Generating sound...')

    // Start time measurement
    const d1 = new Date()

    // Generate audio data\bm
    // NOTE: We'd love to do this in a Web Worker instead! Currently we do it
    // in a setInterval() timer loop instead in order not to block the main UI.
    // TODO: handle correctly opts
    const oSong = _.clone(mSong)
    if (opts) {
      oSong.songData = mSong.songData.slice(opts.firstCol, opts.lastCol + 1)
      oSong.songData = _.map(oSong.songData, function (data) {
        const ndata = _.clone(data)
        ndata.p = data.p.slice(opts.firstRow, opts.lastRow + 1)
        return ndata
      })
      oSong.endPattern = (opts.lastRow + 1) - opts.firstRow + 1
      oSong.songLen = opts.numSeconds
    }
    const mPlayer = new sonantx.MusicGenerator(compressSong(oSong))
    mPlayer.getAudioGenerator(function (ag) {
      mAudioGenerator = ag
      const wave = ag.getWave()
      const d2 = new Date()
      setStatus('Generation time: ' + (d2.getTime() - d1.getTime()) / 1000 + 's')

      // Hide dialog
      hideDialog()

      // Call the callback function
      doneFun(wave)
    })
  }

  // ----------------------------------------------------------------------------
  // Playback follower
  // ----------------------------------------------------------------------------

  let mFollowerTimerID = -1
  let mFollowerFirstRow = 0
  let mFollowerLastRow = 0
  let mFollowerFirstCol = 0
  let mFollowerLastCol = 0
  let mFollowerActive = false
  let mFollowerLastVULeft = 0
  let mFollowerLastVURight = 0

  const getSamplesSinceNote = function (t, chan) {
    const nFloat = t * 44100 / mSong.rowLen
    const n = Math.floor(nFloat)
    const seqPos0 = Math.floor(n / 32) + mFollowerFirstRow
    const patPos0 = n % 32
    for (let k = 0; k < 32; ++k) {
      let seqPos = seqPos0
      let patPos = patPos0 - k
      while (patPos < 0) {
        --seqPos
        if (seqPos < mFollowerFirstRow) return -1
        patPos += 32
      }
      const pat = mSong.songData[chan].p[seqPos] - 1
      if (pat >= 0 && mSong.songData[chan].c[pat].n[patPos] > 0) {
        return (k + (nFloat - n)) * mSong.rowLen
      }
    }
    return -1
  }

  const redrawPlayerGfx = function (t) {
    let i
    const o = document.getElementById('playGfxCanvas')
    const w = mPlayGfxVUImg.width > 0 ? mPlayGfxVUImg.width : o.width
    const h = mPlayGfxVUImg.height > 0 ? mPlayGfxVUImg.height : 51
    const ctx = o.getContext('2d')
    if (ctx) {
      // Draw the VU meter BG
      ctx.drawImage(mPlayGfxVUImg, 0, 0)

      // Calculate singal powers
      let pl = 0; let pr = 0
      if (mFollowerActive && t >= 0) {
        // Get the waveform
        const wave = getData(mAudioGenerator, t, 1000)

        // Calculate volume
        let l, r
        let sl = 0; let sr = 0; let l_old = 0; let r_old = 0
        for (i = 1; i < wave.length; i += 2) {
          l = wave[i - 1]
          r = wave[i]

          // Band-pass filter (low-pass + high-pass)
          sl = 0.8 * l + 0.1 * sl - 0.3 * l_old
          sr = 0.8 * r + 0.1 * sr - 0.3 * r_old
          l_old = l
          r_old = r

          // Sum of squares
          pl += sl * sl
          pr += sr * sr
        }

        // Low-pass filtered mean power (RMS)
        pl = Math.sqrt(pl / wave.length) * 0.2 + mFollowerLastVULeft * 0.8
        pr = Math.sqrt(pr / wave.length) * 0.2 + mFollowerLastVURight * 0.8
        mFollowerLastVULeft = pl
        mFollowerLastVURight = pr
      }

      // Convert to angles in the VU meter
      let a1 = pl > 0 ? 1.3 + 0.5 * Math.log(pl) : -1000
      a1 = a1 < -1 ? -1 : a1 > 1 ? 1 : a1
      a1 *= 0.57
      let a2 = pr > 0 ? 1.3 + 0.5 * Math.log(pr) : -1000
      a2 = a2 < -1 ? -1 : a2 > 1 ? 1 : a2
      a2 *= 0.57

      // Draw VU hands
      ctx.strokeStyle = 'rgb(0,0,0)'
      ctx.beginPath()
      ctx.moveTo(w * 0.25, h * 2.1)
      ctx.lineTo(w * 0.25 + h * 1.8 * Math.sin(a1), h * 2.1 - h * 1.8 * Math.cos(a1))
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(w * 0.75, h * 2.1)
      ctx.lineTo(w * 0.75 + h * 1.8 * Math.sin(a2), h * 2.1 - h * 1.8 * Math.cos(a2))
      ctx.stroke()

      // Draw leds
      ctx.fillStyle = 'rgb(0,0,0)'
      ctx.fillRect(0, h, w, 20)
      for (i = 0; i < 8; ++i) {
        // Draw un-lit led
        const x = Math.round(26 + 26.5 * i)
        ctx.drawImage(mPlayGfxLedOffImg, x, h)

        if (i >= mFollowerFirstCol && i <= mFollowerLastCol) {
          // Get envelope profile for this channel
          const env_a = mSong.songData[i].env_attack
          let env_r = mSong.songData[i].env_sustain + mSong.songData[i].env_release
          let env_tot = env_a + env_r
          if (env_tot < 10000) {
            env_tot = 10000
            env_r = env_tot - env_a
          }

          // Get number of samples since last new note
          const numSamp = getSamplesSinceNote(t, i)
          if (numSamp >= 0 && numSamp < env_tot) {
            // Calculate current envelope (same method as the synth, except sustain)
            let alpha
            if (numSamp < env_a) {
              alpha = numSamp / env_a
            } else {
              alpha = 1 - (numSamp - env_a) / env_r
            }

            // Draw lit led with alpha blending
            ctx.globalAlpha = alpha * alpha
            ctx.drawImage(mPlayGfxLedOnImg, x, h)
            ctx.globalAlpha = 1.0
          }
        }
      }
    }
  }

  const updateFollower = function () {
    let i, o
    if (mAudio === null) return

    // Calculate current song position
    const t = mAudio.currentTime
    const n = Math.floor(t * 44100 / mSong.rowLen)
    const seqPos = Math.floor(n / 32) + mFollowerFirstRow
    const patPos = n % 32

    // Are we past the play range (i.e. stop the follower?)
    if (seqPos > mFollowerLastRow) {
      stopFollower()

      // Reset pattern position
      mPatternRow = 0
      mPatternRow2 = 0
      updatePattern()

      return
    }

    const newSeqPos = (seqPos !== mSeqRow)
    const newPatPos = newSeqPos || (patPos !== mPatternRow)

    // Update the sequencer
    if (newSeqPos) {
      if (seqPos >= 0) {
        mSeqRow = seqPos
        mSeqRow2 = seqPos
        updateSequencer(true, true)
      }
      for (i = 0; i < 48; ++i) {
        o = document.getElementById('spr' + i)
        o.className = (i === seqPos ? 'playpos' : '')
      }
    }

    // Update the pattern
    if (newPatPos) {
      if (patPos >= 0) {
        mPatternRow = patPos
        mPatternRow2 = patPos
        updatePattern()
      }
      for (i = 0; i < 32; ++i) {
        o = document.getElementById('ppr' + i)
        o.className = (i === patPos ? 'playpos' : '')
      }
    }

    // Player graphics
    redrawPlayerGfx(t)
  }

  const startFollower = function () {
    // Update the sequencer selection
    mSeqRow = mFollowerFirstRow
    mSeqRow2 = mFollowerFirstRow
    mSeqCol2 = mSeqCol
    updateSequencer(true, true)
    updatePattern()

    // Start the follower
    mFollowerActive = true
    mFollowerTimerID = setInterval(updateFollower, 16)
  }

  const stopFollower = function () {
    let i
    if (mFollowerActive) {
      // Stop the follower
      if (mFollowerTimerID !== -1) {
        clearInterval(mFollowerTimerID)
        mFollowerTimerID = -1
      }

      // Clear the follower markers
      for (i = 0; i < 48; ++i) {
        document.getElementById('spr' + i).className = ''
      }
      for (i = 0; i < 32; ++i) {
        document.getElementById('ppr' + i).className = ''
      }

      // Clear player gfx
      redrawPlayerGfx(-1)

      mFollowerActive = false
    }
  }

  // ----------------------------------------------------------------------------
  // (end of playback follower)
  // ----------------------------------------------------------------------------

  const playSong = function (e) {
    // Stop the currently playing audio
    stopPlaying()

    // Update song ranges
    updateSongRanges()

    // Select range to play
    mFollowerFirstRow = 0
    mFollowerLastRow = mSong.endPattern - 2
    mFollowerFirstCol = 0
    mFollowerLastCol = 7

    // Generate audio data
    const doneFun = function (wave) {
      if (mAudio === null) {
        alert('Audio element unavailable.')
        return
      }

      try {
        const uri = 'data:audio/wav;base64,' + btoa(wave)

        // Start the follower
        startFollower()

        // Load the data into the audio element (it will start playing as soon as
        // the data has been loaded)
        mAudio.src = uri

        // Hack
        mAudio.play()
      } catch (err) {
        alert('Error playing: ' + err.message)
      }
    }
    generateAudio(doneFun)

    return false
  }

  const playRange = function (e) {
    // Stop the currently playing audio
    stopPlaying()

    // Update song ranges
    updateSongRanges()

    // Select range to play
    const opts = {
      firstRow: mSeqRow,
      lastRow: mSeqRow2,
      firstCol: mSeqCol,
      lastCol: mSeqCol2,
      numSeconds: ((mSeqRow2 - mSeqRow + 1) * 32 + 8) * mSong.rowLen / 44100
    }
    mFollowerFirstRow = mSeqRow
    mFollowerLastRow = mSeqRow2
    mFollowerFirstCol = mSeqCol
    mFollowerLastCol = mSeqCol2

    // Generate audio data
    const doneFun = function (wave) {
      if (mAudio === null) {
        alert('Audio element unavailable.')
        return
      }

      try {
        const uri = 'data:audio/wav;base64,' + btoa(wave)

        // Restart the follower
        startFollower()

        // Load the data into the audio element (it will start playing as soon as
        // the data has been loaded)
        mAudio.src = uri

        // Hack
        mAudio.play()
      } catch (err) {
        alert('Error playing: ' + err.message)
      }
    }
    generateAudio(doneFun, opts)

    return false
  }

  const stopPlaying = function (e) {
    if (mAudio === null) {
      alert('Audio element unavailable.')
      return
    }

    stopFollower()

    mAudio.pause()
    return false
  }

  const bpmFocus = function (e) {
    setEditMode(EDIT_NONE)
    return true
  }

  const instrPresetFocus = function (e) {
    setEditMode(EDIT_NONE)
    return true
  }

  const patternCopyMouseDown = function (e) {
    if (mSeqRow === mSeqRow2 && mSeqCol === mSeqCol2) {
      const pat = mSong.songData[mSeqCol].p[mSeqRow] - 1
      if (pat >= 0) {
        mPatCopyBuffer = []
        for (let row = mPatternRow; row <= mPatternRow2; ++row) {
          mPatCopyBuffer.push(mSong.songData[mSeqCol].c[pat].n[row])
        }
      }
    }
    return false
  }

  const patternPasteMouseDown = function (e) {
    if (mSeqRow === mSeqRow2 && mSeqCol === mSeqCol2) {
      const pat = mSong.songData[mSeqCol].p[mSeqRow] - 1
      if (pat >= 0) {
        for (let row = mPatternRow, i = 0; row < 32 && i < mPatCopyBuffer.length; ++row, ++i) {
          mSong.songData[mSeqCol].c[pat].n[row] = mPatCopyBuffer[i]
        }
        updatePattern()
      }
    }
    return false
  }

  const patternNoteUpMouseDown = function (e) {
    if (mSeqRow === mSeqRow2 && mSeqCol === mSeqCol2) {
      const pat = mSong.songData[mSeqCol].p[mSeqRow] - 1
      if (pat >= 0) {
        for (let row = mPatternRow; row <= mPatternRow2; ++row) {
          const n = mSong.songData[mSeqCol].c[pat].n[row]
          if (n > 0) {
            mSong.songData[mSeqCol].c[pat].n[row] = n + 1
          }
        }
        updatePattern()
      }
    }
    return false
  }

  const patternNoteDownMouseDown = function (e) {
    if (mSeqRow === mSeqRow2 && mSeqCol === mSeqCol2) {
      const pat = mSong.songData[mSeqCol].p[mSeqRow] - 1
      if (pat >= 0) {
        for (let row = mPatternRow; row <= mPatternRow2; ++row) {
          const n = mSong.songData[mSeqCol].c[pat].n[row]
          if (n > 1) {
            mSong.songData[mSeqCol].c[pat].n[row] = n - 1
          }
        }
        updatePattern()
      }
    }
    return false
  }

  const patternOctaveUpMouseDown = function (e) {
    if (mSeqRow === mSeqRow2 && mSeqCol === mSeqCol2) {
      const pat = mSong.songData[mSeqCol].p[mSeqRow] - 1
      if (pat >= 0) {
        for (let row = mPatternRow; row <= mPatternRow2; ++row) {
          const n = mSong.songData[mSeqCol].c[pat].n[row]
          if (n > 0) {
            mSong.songData[mSeqCol].c[pat].n[row] = n + 12
          }
        }
        updatePattern()
      }
    }
    return false
  }

  const patternOctaveDownMouseDown = function (e) {
    if (mSeqRow === mSeqRow2 && mSeqCol === mSeqCol2) {
      const pat = mSong.songData[mSeqCol].p[mSeqRow] - 1
      if (pat >= 0) {
        for (let row = mPatternRow; row <= mPatternRow2; ++row) {
          const n = mSong.songData[mSeqCol].c[pat].n[row]
          if (n > 1) {
            mSong.songData[mSeqCol].c[pat].n[row] = n - 12
          }
        }
        updatePattern()
      }
    }
    return false
  }

  const sequencerCopyMouseDown = function (e) {
    mSeqCopyBuffer = []
    for (let row = mSeqRow; row <= mSeqRow2; ++row) {
      const arr = []
      for (let col = mSeqCol; col <= mSeqCol2; ++col) {
        arr.push(mSong.songData[col].p[row])
      }
      mSeqCopyBuffer.push(arr)
    }
    return false
  }

  const sequencerPasteMouseDown = function (e) {
    for (let row = mSeqRow, i = 0; row < 48 && i < mSeqCopyBuffer.length; ++row, ++i) {
      for (let col = mSeqCol, j = 0; col < 8 && j < mSeqCopyBuffer[i].length; ++col, ++j) {
        mSong.songData[col].p[row] = mSeqCopyBuffer[i][j]
      }
    }
    updateSequencer()
    return false
  }

  const sequencerPatUpMouseDown = function (e) {
    for (let row = mSeqRow; row <= mSeqRow2; ++row) {
      for (let col = mSeqCol; col <= mSeqCol2; ++col) {
        const pat = mSong.songData[col].p[row]
        if (pat < 10) {
          mSong.songData[col].p[row] = pat + 1
        }
      }
    }
    updateSequencer()
    return false
  }

  const sequencerPatDownMouseDown = function (e) {
    for (let row = mSeqRow; row <= mSeqRow2; ++row) {
      for (let col = mSeqCol; col <= mSeqCol2; ++col) {
        const pat = mSong.songData[col].p[row]
        if (pat > 0) {
          mSong.songData[col].p[row] = pat - 1
        }
      }
    }
    updateSequencer()
    return false
  }

  const boxMouseDown = function (e) {
    if (mSeqCol === mSeqCol2) {
      if (!e) { e = window.event }
      const o = getEventElement(e)
      if (o.id === 'osc1_xenv') { mSong.songData[mSeqCol].osc1_xenv = mSong.songData[mSeqCol].osc1_xenv ? 0 : 1 } else if (o.id === 'osc2_xenv') { mSong.songData[mSeqCol].osc2_xenv = mSong.songData[mSeqCol].osc2_xenv ? 0 : 1 } else if (o.id === 'lfo_o1fm') { mSong.songData[mSeqCol].lfo_osc1_freq = mSong.songData[mSeqCol].lfo_osc1_freq ? 0 : 1 } else if (o.id === 'lfo_fxfreq') { mSong.songData[mSeqCol].lfo_fx_freq = mSong.songData[mSeqCol].lfo_fx_freq ? 0 : 1 }
      updateInstrument(true)
      unfocusHTMLInputElements()
      return false
    }
    return true
  }

  const osc1WaveMouseDown = function (e) {
    if (mSeqCol === mSeqCol2) {
      if (!e) { e = window.event }
      const o = getEventElement(e)
      let wave = 0
      if (o.id === 'osc1_wave_sin') wave = 0
      else if (o.id === 'osc1_wave_sqr') wave = 1
      else if (o.id === 'osc1_wave_saw') wave = 2
      else if (o.id === 'osc1_wave_tri') wave = 3
      mSong.songData[mSeqCol].osc1_waveform = wave
      updateInstrument()
      unfocusHTMLInputElements()
      return false
    }
    return true
  }

  const osc2WaveMouseDown = function (e) {
    if (mSeqCol === mSeqCol2) {
      if (!e) { e = window.event }
      const o = getEventElement(e)
      let wave = 0
      if (o.id === 'osc2_wave_sin') wave = 0
      else if (o.id === 'osc2_wave_sqr') wave = 1
      else if (o.id === 'osc2_wave_saw') wave = 2
      else if (o.id === 'osc2_wave_tri') wave = 3
      mSong.songData[mSeqCol].osc2_waveform = wave
      updateInstrument(true)
      unfocusHTMLInputElements()
      return false
    }
    return true
  }

  const lfoWaveMouseDown = function (e) {
    if (mSeqCol === mSeqCol2) {
      if (!e) { e = window.event }
      const o = getEventElement(e)
      let wave = 0
      if (o.id === 'lfo_wave_sin') wave = 0
      else if (o.id === 'lfo_wave_sqr') wave = 1
      else if (o.id === 'lfo_wave_saw') wave = 2
      else if (o.id === 'lfo_wave_tri') wave = 3
      mSong.songData[mSeqCol].lfo_waveform = wave
      updateInstrument(true)
      unfocusHTMLInputElements()
      return false
    }
    return true
  }

  const fxFiltMouseDown = function (e) {
    if (mSeqCol === mSeqCol2) {
      if (!e) { e = window.event }
      const o = getEventElement(e)
      let filt = 0
      if (o.id === 'fx_filt_hp') filt = 1
      else if (o.id === 'fx_filt_lp') filt = 2
      else if (o.id === 'fx_filt_bp') filt = 3
      else if (o.id === 'fx_filt_n') filt = 4
      if (mSong.songData[mSeqCol].fx_filter !== filt) { mSong.songData[mSeqCol].fx_filter = filt } else { mSong.songData[mSeqCol].fx_filter = 0 }
      updateInstrument(true)
      unfocusHTMLInputElements()
      return false
    }
    return true
  }

  const octaveUp = function (e) {
    if (mKeyboardOctave < 8) {
      mKeyboardOctave++
      document.getElementById('keyboardOctave').innerHTML = '' + mKeyboardOctave
    }
    return false
  }

  const octaveDown = function (e) {
    if (mKeyboardOctave > 1) {
      mKeyboardOctave--
      document.getElementById('keyboardOctave').innerHTML = '' + mKeyboardOctave
    }
    return false
  }

  const selectPreset = function (e) {
    if (mSeqCol === mSeqCol2) {
      if (!e) { e = window.event }
      const o = getEventElement(e)
      let val = o.options[o.selectedIndex].value
      if (val !== '') {
        val = parseInt(val, 10)
        if (val) {
          // Clone instrument settings
          const src = gInstrumentPresets[val]
          applyInstrument(src, mSong.songData[mSeqCol])

          updateInstrument(false)
          return false
        }
      }
    }
    return true
  }

  const applyInstrument = function (src, to) {
    to.osc1_oct = src.osc1_oct
    to.osc1_det = src.osc1_det
    to.osc1_detune = src.osc1_detune
    to.osc1_xenv = src.osc1_xenv
    to.osc1_vol = src.osc1_vol
    to.osc1_waveform = src.osc1_waveform
    to.osc2_oct = src.osc2_oct
    to.osc2_det = src.osc2_det
    to.osc2_detune = src.osc2_detune
    to.osc2_xenv = src.osc2_xenv
    to.osc2_vol = src.osc2_vol
    to.osc2_waveform = src.osc2_waveform
    to.noise_fader = src.noise_fader
    to.env_attack = src.env_attack
    to.env_sustain = src.env_sustain
    to.env_release = src.env_release
    to.env_master = src.env_master
    to.fx_filter = src.fx_filter
    to.fx_freq = src.fx_freq
    to.fx_resonance = src.fx_resonance
    to.fx_delay_time = src.fx_delay_time
    to.fx_delay_amt = src.fx_delay_amt
    to.fx_pan_freq = src.fx_pan_freq
    to.fx_pan_amt = src.fx_pan_amt
    to.lfo_osc1_freq = src.lfo_osc1_freq
    to.lfo_fx_freq = src.lfo_fx_freq
    to.lfo_freq = src.lfo_freq
    to.lfo_amt = src.lfo_amt
    to.lfo_waveform = src.lfo_waveform
  }

  const importInstrument = function () {
    if (mSeqCol !== mSeqCol2 || mSeqCol < 0 || mSeqCol >= mSong.songData.length) { return }
    const instr = mSong.songData[mSeqCol]

    const parent = document.getElementById('dialog')
    parent.innerHTML = ''

    // Create dialog content
    let o
    o = document.createElement('h3')
    parent.appendChild(o)
    o.appendChild(document.createTextNode('Import instrument in JSON'))
    parent.appendChild(document.createElement('br'))
    let el = $('<textarea id="jsonTextArea" style="width: 200px; height: 100px"></textarea>')
    o = el[0]
    parent.appendChild(o)
    parent.appendChild(document.createElement('br'))
    el = $('<button id="jsonImportButton">Import</button>')
    o = el[0]
    parent.appendChild(o)
    parent.appendChild(document.createTextNode(' '))
    el = $('<button id="jsonCancelButton">Cancel</button>')
    o = el[0]
    parent.appendChild(o)
    $('#jsonImportButton').click(function () {
      const json = $('#jsonTextArea').val()
      const src = JSON.parse(json)
      applyInstrument(src, instr)
      updateInstrument(false)
      hideDialog()
    })
    $('#jsonCancelButton').click(function () {
      hideDialog()
    })

    showDialog()
  }

  const keyboardMouseDown = function (e) {
    if (!e) { e = window.event }
    const p = getMousePos(e, true)

    // Calculate keyboard position
    let n = 0
    if (p[1] < 67) {
      // Possible black key
      for (let i = 0; i < mBlackKeyPos.length; i += 2) {
        if (p[0] >= (mBlackKeyPos[i] - 5) &&
            p[0] <= (mBlackKeyPos[i] + 5)) {
          n = mBlackKeyPos[i + 1]
          break
        }
      }
    }
    if (!n) {
      // Must be a white key
      n = Math.floor((p[0] * 21) / 475) * 2
      let comp = 0
      if (n >= 36) comp++
      if (n >= 28) comp++
      if (n >= 22) comp++
      if (n >= 14) comp++
      if (n >= 8) comp++
      n -= comp
    }

    // Adjust for G-based scale
    n = n - 7

    // Edit pattern
    if (addPatternNote(n + mKeyboardOctave * 12)) {
      return false
    }
  }

  const patternMouseDown = function (e) {
    if (!e) { e = window.event }
    if (!mFollowerActive) {
      const o = getEventElement(e)
      setSelectedPatternRow(parseInt(o.id.slice(2), 10))
      mSelectingPatternRange = true
    }
    setEditMode(EDIT_PATTERN)
    return false
  }

  const patternMouseOver = function (e) {
    if (mSelectingPatternRange) {
      if (!e) { e = window.event }
      const o = getEventElement(e)
      setSelectedPatternRow2(parseInt(o.id.slice(2), 10))
      return false
    }
    return true
  }

  const patternMouseUp = function (e) {
    if (mSelectingPatternRange) {
      if (!e) { e = window.event }
      const o = getEventElement(e)
      setSelectedPatternRow2(parseInt(o.id.slice(2), 10))
      mSelectingPatternRange = false
      return false
    }
    return true
  }

  const sequencerMouseDown = function (e) {
    if (!e) { e = window.event }
    const o = getEventElement(e)
    const col = parseInt(o.id.slice(2, 3), 10)
    let row
    if (!mFollowerActive) { row = parseInt(o.id.slice(4), 10) } else { row = mSeqRow }
    const newChannel = col !== mSeqCol || mSeqCol !== mSeqCol2
    setSelectedSequencerCell(col, row)
    if (!mFollowerActive) { mSelectingSeqRange = true }
    setEditMode(EDIT_SEQUENCE)
    updatePattern()
    updateInstrument(newChannel)
    return false
  }

  const sequencerMouseOver = function (e) {
    if (mSelectingSeqRange) {
      if (!e) { e = window.event }
      const o = getEventElement(e)
      const col = parseInt(o.id.slice(2, 3), 10)
      const row = parseInt(o.id.slice(4), 10)
      setSelectedSequencerCell2(col, row)
      updatePattern()
      updateInstrument(true)
      return false
    }
    return true
  }

  const sequencerMouseUp = function (e) {
    if (mSelectingSeqRange) {
      if (!e) { e = window.event }
      const o = getEventElement(e)
      const col = parseInt(o.id.slice(2, 3), 10)
      const row = parseInt(o.id.slice(4), 10)
      const newChannel = col !== mSeqCol2 || mSeqCol !== mSeqCol2
      setSelectedSequencerCell2(col, row)
      mSelectingSeqRange = false
      updatePattern()
      updateInstrument(newChannel)
      return false
    }
    return true
  }

  let mActiveSlider = null

  const sliderMouseDown = function (e) {
    if (mSeqCol === mSeqCol2) {
      if (!e) { e = window.event }
      mActiveSlider = getEventElement(e)
      unfocusHTMLInputElements()
      return false
    }
    return true
  }

  const mouseMove = function (e) {
    if (!e) { e = window.event }

    // Handle slider?
    if (mActiveSlider) {
      // Calculate slider position
      const pos = getMousePos(e, false)
      const origin = getElementPos(mActiveSlider.parentNode)
      let x = pos[0] - 6 - origin[0]
      x = x < 0 ? 0 : (x > 191 ? 1 : (x / 191))

      // Adapt to the range of the slider
      if (mActiveSlider.sliderProps.nonLinear) {
        x = x * x
      }
      const min = mActiveSlider.sliderProps.min
      const max = mActiveSlider.sliderProps.max
      x = Math.round(min + ((max - min) * x))

      // Update the song property
      const instr = mSong.songData[mSeqCol]
      if (mActiveSlider.id === 'osc1_vol') instr.osc1_vol = x
      else if (mActiveSlider.id === 'osc1_oct') instr.osc1_oct = x
      else if (mActiveSlider.id === 'osc1_semi') instr.osc1_det = x
      else if (mActiveSlider.id === 'osc1_det') instr.osc1_detune = x
      else if (mActiveSlider.id === 'osc2_vol') instr.osc2_vol = x
      else if (mActiveSlider.id === 'osc2_oct') instr.osc2_oct = x
      else if (mActiveSlider.id === 'osc2_semi') instr.osc2_det = x
      else if (mActiveSlider.id === 'osc2_det') instr.osc2_detune = x
      else if (mActiveSlider.id === 'noise_vol') instr.noise_fader = x
      else if (mActiveSlider.id === 'env_master') instr.env_master = x
      else if (mActiveSlider.id === 'env_att') instr.env_attack = x
      else if (mActiveSlider.id === 'env_sust') instr.env_sustain = x
      else if (mActiveSlider.id === 'env_rel') instr.env_release = x
      else if (mActiveSlider.id === 'lfo_amt') instr.lfo_amt = x
      else if (mActiveSlider.id === 'lfo_freq') instr.lfo_freq = x
      else if (mActiveSlider.id === 'fx_freq') instr.fx_freq = x
      else if (mActiveSlider.id === 'fx_res') instr.fx_resonance = x
      else if (mActiveSlider.id === 'fx_dly_amt') instr.fx_delay_amt = x
      else if (mActiveSlider.id === 'fx_dly_time') instr.fx_delay_time = x
      else if (mActiveSlider.id === 'fx_pan_amt') instr.fx_pan_amt = x
      else if (mActiveSlider.id === 'fx_pan_freq') instr.fx_pan_freq = x

      // Update the slider position
      updateSlider(mActiveSlider, x)
      clearPresetSelection()
      return false
    }
    return true
  }

  const mouseUp = function (e) {
    if (mActiveSlider) {
      mActiveSlider = null
      return false
    }
    return true
  }

  const keyDown = function (e) {
    if (!e) { e = window.event }

    let row, col, n

    // Sequencer editing
    if (mEditMode === EDIT_SEQUENCE &&
        mSeqCol === mSeqCol2 && mSeqRow === mSeqRow2) {
      // 0 - 9
      if (e.keyCode >= 48 && e.keyCode <= 57) {
        mSong.songData[mSeqCol].p[mSeqRow] = e.keyCode - 47
        updateSequencer()
        updatePattern()
        return false
      }
    }

    // Pattern editing (not sure how layout sensitive this is)
    if (mEditMode === EDIT_PATTERN &&
        mSeqCol === mSeqCol2 && mSeqRow === mSeqRow2 &&
        mPatternRow === mPatternRow2) {
      n = -1
      switch (e.keyCode) {
        // First octave on the ZXCVB... row
        case 90: n = 0; break
        case 83: n = 1; break
        case 88: n = 2; break
        case 68: n = 3; break
        case 67: n = 4; break
        case 86: n = 5; break
        case 71: n = 6; break
        case 66: n = 7; break
        case 72: n = 8; break
        case 78: n = 9; break
        case 74: n = 10; break
        case 77: n = 11; break
        // "Bonus keys" 1 (extensions of first octave into second octave)
        case 188: n = 12; break
        case 76: n = 13; break
        case 190: n = 14; break
        case 186: n = 15; break
        case 191: n = 16; break
        // Second octave on the QWERTY... row
        case 81: n = 12; break
        case 50: n = 13; break
        case 87: n = 14; break
        case 51: n = 15; break
        case 69: n = 16; break
        case 82: n = 17; break
        case 53: n = 18; break
        case 84: n = 19; break
        case 54: n = 20; break
        case 89: n = 21; break
        case 55: n = 22; break
        case 85: n = 23; break
        // "Bonus keys" 2 (extensions of second octave into third octave)
        case 73: n = 24; break
        case 57: n = 25; break
        case 79: n = 26; break
        case 48: n = 27; break
        case 80: n = 28; break
      }
      if (n >= 0) {
        if (addPatternNote(n + mKeyboardOctave * 12)) {
          return false
        }
      }
    }

    // The rest of the key presses...
    switch (e.keyCode) {
      case 39: // RIGHT
        if (mEditMode === EDIT_SEQUENCE) {
          setSelectedSequencerCell((mSeqCol + 1) % 8, mSeqRow)
          updatePattern()
          updateInstrument(true)
          return false
        }
        break

      case 37: // LEFT
        if (mEditMode === EDIT_SEQUENCE) {
          setSelectedSequencerCell((mSeqCol - 1 + 8) % 8, mSeqRow)
          updatePattern()
          updateInstrument(true)
          return false
        }
        break

      case 40: // DOWN
        if (mEditMode === EDIT_SEQUENCE) {
          setSelectedSequencerCell(mSeqCol, (mSeqRow + 1) % 48)
          updatePattern()
          return false
        } else if (mEditMode === EDIT_PATTERN) {
          setSelectedPatternRow((mPatternRow + 1) % 32)
          return false
        }
        break

      case 38: // UP
        if (mEditMode === EDIT_SEQUENCE) {
          setSelectedSequencerCell(mSeqCol, (mSeqRow - 1 + 48) % 48)
          updatePattern()
          return false
        } else if (mEditMode === EDIT_PATTERN) {
          setSelectedPatternRow((mPatternRow - 1 + 32) % 32)
          return false
        }
        break

      case 36: // HOME
        if (mEditMode === EDIT_SEQUENCE) {
          setSelectedSequencerCell(mSeqCol, 0)
          updatePattern()
          return false
        } else if (mEditMode === EDIT_PATTERN) {
          setSelectedPatternRow(0)
          return false
        }
        break

      case 35: // END
        if (mEditMode === EDIT_SEQUENCE) {
          setSelectedSequencerCell(mSeqCol, 47)
          updatePattern()
          return false
        } else if (mEditMode === EDIT_PATTERN) {
          setSelectedPatternRow(31)
          return false
        }
        break

      case 32: // SPACE
        if (mEditMode !== EDIT_NONE) {
          playRange(e)
          return false
        }
        break

      case 46: // DELETE
        if (mEditMode === EDIT_SEQUENCE) {
          for (row = mSeqRow; row <= mSeqRow2; ++row) {
            for (col = mSeqCol; col <= mSeqCol2; ++col) {
              mSong.songData[col].p[row] = 0
            }
          }
          updateSequencer()
          updatePattern()
          return false
        } else if (mEditMode === EDIT_PATTERN) {
          if (mSeqRow === mSeqRow2 && mSeqCol === mSeqCol2) {
            const pat = mSong.songData[mSeqCol].p[mSeqRow] - 1
            if (pat >= 0) {
              for (row = mPatternRow; row <= mPatternRow2; ++row) {
                mSong.songData[mSeqCol].c[pat].n[row] = 0
              }
              if (mPatternRow === mPatternRow2) {
                setSelectedPatternRow((mPatternRow + 1) % 32)
              }
              updatePattern()
            }
            return false
          }
        }
        break

      default:
        // alert("onkeydown: " + e.keyCode);
        break
    }

    return true
  }

  const activateMasterEvents = function () {
    // Set up the master mouse event handlers
    document.onmousedown = null
    document.onmousemove = mouseMove
    document.onmouseup = mouseUp

    // Set up the master key event handler
    document.onkeydown = keyDown
  }

  const deactivateMasterEvents = function () {
    // Set up the master mouse event handlers
    document.onmousedown = function () { return true }
    document.onmousemove = null
    document.onmouseup = null

    // Set up the master key event handler
    document.onkeydown = null
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  this.init = function () {
    let i, j, o

    // Preload images
    preloadImage(progressPng)
    preloadImage(boxUncheck)
    preloadImage(boxUncheck)
    preloadImage(waveSin)
    preloadImage(waveSinSel)
    preloadImage(waveSaw)
    preloadImage(waveSawSel)
    preloadImage(waveSqr)
    preloadImage(waveSqrSel)
    preloadImage(waveTri)
    preloadImage(waveTriSel)
    preloadImage(filtLp)
    preloadImage(filtLpSel)
    preloadImage(filtHp)
    preloadImage(filtHpSel)
    preloadImage(filtBp)
    preloadImage(filtBpSel)
    preloadImage(filtN)
    preloadImage(filtNSel)

    // Set up presets
    initPresets()

    // Load images for the play graphics canvas
    mPlayGfxVUImg.onload = function () {
      redrawPlayerGfx(-1)
    }
    mPlayGfxLedOffImg.onload = function () {
      redrawPlayerGfx(-1)
    }
    mPlayGfxVUImg.src = playGfxBg
    mPlayGfxLedOffImg.src = ledOff
    mPlayGfxLedOnImg.src = ledOn

    // Set up GUI elements
    document.getElementById('osc1_vol').sliderProps = { min: 0, max: 255 }
    document.getElementById('osc1_oct').sliderProps = { min: 0, max: 16 }
    document.getElementById('osc1_semi').sliderProps = { min: 0, max: 11 }
    document.getElementById('osc1_det').sliderProps = { min: 0, max: 255 }
    document.getElementById('osc2_vol').sliderProps = { min: 0, max: 255 }
    document.getElementById('osc2_oct').sliderProps = { min: 0, max: 16 }
    document.getElementById('osc2_semi').sliderProps = { min: 0, max: 11 }
    document.getElementById('osc2_det').sliderProps = { min: 0, max: 255 }
    document.getElementById('noise_vol').sliderProps = { min: 0, max: 255 }
    document.getElementById('env_master').sliderProps = { min: 0, max: 255 }
    document.getElementById('env_att').sliderProps = { min: 0, max: 200000, nonLinear: true }
    document.getElementById('env_sust').sliderProps = { min: 0, max: 200000, nonLinear: true }
    document.getElementById('env_rel').sliderProps = { min: 0, max: 200000, nonLinear: true }
    document.getElementById('lfo_amt').sliderProps = { min: 0, max: 255 }
    document.getElementById('lfo_freq').sliderProps = { min: 0, max: 16 }
    document.getElementById('fx_freq').sliderProps = { min: 0, max: 11025, nonLinear: true }
    document.getElementById('fx_res').sliderProps = { min: 0, max: 255 }
    document.getElementById('fx_dly_amt').sliderProps = { min: 0, max: 255 }
    document.getElementById('fx_dly_time').sliderProps = { min: 0, max: 16 }
    document.getElementById('fx_pan_amt').sliderProps = { min: 0, max: 255 }
    document.getElementById('fx_pan_freq').sliderProps = { min: 0, max: 16 }

    // Create audio element, and always play the audio as soon as it's ready
    try {
      mAudio = new Audio()
      mAudio.addEventListener('canplay', function () { this.play() }, true)
    } catch (err) {
      mAudio = null
    }

    const fragment = new URI().fragment() || ''
    if (fragment) {
      const json = LZString.decompressFromBase64(URI.decode(fragment))
      const song = JSON.parse(json)
      newSong(song)
    } else {
      newSong()
    }

    // Set up event handlers for the sequencer
    for (i = 0; i < 8; ++i) {
      for (j = 0; j < 48; ++j) {
        o = document.getElementById('sc' + i + 'r' + j)
        o.onmousedown = sequencerMouseDown
        o.onmouseover = sequencerMouseOver
        o.onmouseup = sequencerMouseUp
      }
    }

    // Set up event handlers for the pattern editor
    for (i = 0; i < 32; ++i) {
      o = document.getElementById('pr' + i)
      o.onmousedown = patternMouseDown
      o.onmouseover = patternMouseOver
      o.onmouseup = patternMouseUp
    }

    // Misc event handlers
    document.getElementById('newSong').onmousedown = function () { newSong() }
    document.getElementById('openSong').onmousedown = openSong
    document.getElementById('exportURL').onmousedown = exportURL
    document.getElementById('exportJSON').onmousedown = exportJSON
    document.getElementById('exportWAV').onmousedown = exportWAV
    document.getElementById('exportWAVRange').onmousedown = exportWAVRange
    document.getElementById('playSong').onmousedown = playSong
    document.getElementById('playRange').onmousedown = playRange
    document.getElementById('stopPlaying').onmousedown = stopPlaying
    document.getElementById('bpm').onfocus = bpmFocus

    document.getElementById('importInstrument').onmousedown = importInstrument
    document.getElementById('exportInstrument').onmousedown = exportInstrument

    document.getElementById('sequencerCopy').onmousedown = sequencerCopyMouseDown
    document.getElementById('sequencerPaste').onmousedown = sequencerPasteMouseDown
    document.getElementById('sequencerPatUp').onmousedown = sequencerPatUpMouseDown
    document.getElementById('sequencerPatDown').onmousedown = sequencerPatDownMouseDown

    document.getElementById('patternCopy').onmousedown = patternCopyMouseDown
    document.getElementById('patternPaste').onmousedown = patternPasteMouseDown
    document.getElementById('patternNoteUp').onmousedown = patternNoteUpMouseDown
    document.getElementById('patternNoteDown').onmousedown = patternNoteDownMouseDown
    document.getElementById('patternOctaveUp').onmousedown = patternOctaveUpMouseDown
    document.getElementById('patternOctaveDown').onmousedown = patternOctaveDownMouseDown

    document.getElementById('instrPreset').onfocus = instrPresetFocus
    document.getElementById('instrPreset').onchange = selectPreset
    document.getElementById('osc1_wave_sin').onmousedown = osc1WaveMouseDown
    document.getElementById('osc1_wave_sqr').onmousedown = osc1WaveMouseDown
    document.getElementById('osc1_wave_saw').onmousedown = osc1WaveMouseDown
    document.getElementById('osc1_wave_tri').onmousedown = osc1WaveMouseDown
    document.getElementById('osc1_vol').onmousedown = sliderMouseDown
    document.getElementById('osc1_oct').onmousedown = sliderMouseDown
    document.getElementById('osc1_semi').onmousedown = sliderMouseDown
    document.getElementById('osc1_det').onmousedown = sliderMouseDown
    document.getElementById('osc1_xenv').onmousedown = boxMouseDown
    document.getElementById('osc2_wave_sin').onmousedown = osc2WaveMouseDown
    document.getElementById('osc2_wave_sqr').onmousedown = osc2WaveMouseDown
    document.getElementById('osc2_wave_saw').onmousedown = osc2WaveMouseDown
    document.getElementById('osc2_wave_tri').onmousedown = osc2WaveMouseDown
    document.getElementById('osc2_vol').onmousedown = sliderMouseDown
    document.getElementById('osc2_oct').onmousedown = sliderMouseDown
    document.getElementById('osc2_semi').onmousedown = sliderMouseDown
    document.getElementById('osc2_det').onmousedown = sliderMouseDown
    document.getElementById('osc2_xenv').onmousedown = boxMouseDown
    document.getElementById('noise_vol').onmousedown = sliderMouseDown
    document.getElementById('env_master').onmousedown = sliderMouseDown
    document.getElementById('env_att').onmousedown = sliderMouseDown
    document.getElementById('env_sust').onmousedown = sliderMouseDown
    document.getElementById('env_rel').onmousedown = sliderMouseDown
    document.getElementById('lfo_wave_sin').onmousedown = lfoWaveMouseDown
    document.getElementById('lfo_wave_sqr').onmousedown = lfoWaveMouseDown
    document.getElementById('lfo_wave_saw').onmousedown = lfoWaveMouseDown
    document.getElementById('lfo_wave_tri').onmousedown = lfoWaveMouseDown
    document.getElementById('lfo_amt').onmousedown = sliderMouseDown
    document.getElementById('lfo_freq').onmousedown = sliderMouseDown
    document.getElementById('lfo_o1fm').onmousedown = boxMouseDown
    document.getElementById('lfo_fxfreq').onmousedown = boxMouseDown
    document.getElementById('fx_filt_lp').onmousedown = fxFiltMouseDown
    document.getElementById('fx_filt_hp').onmousedown = fxFiltMouseDown
    document.getElementById('fx_filt_bp').onmousedown = fxFiltMouseDown
    document.getElementById('fx_filt_n').onmousedown = fxFiltMouseDown
    document.getElementById('fx_freq').onmousedown = sliderMouseDown
    document.getElementById('fx_res').onmousedown = sliderMouseDown
    document.getElementById('fx_dly_amt').onmousedown = sliderMouseDown
    document.getElementById('fx_dly_time').onmousedown = sliderMouseDown
    document.getElementById('fx_pan_amt').onmousedown = sliderMouseDown
    document.getElementById('fx_pan_freq').onmousedown = sliderMouseDown

    document.getElementById('octaveDown').onmousedown = octaveDown
    document.getElementById('octaveUp').onmousedown = octaveUp
    document.getElementById('keyboard').onmousedown = keyboardMouseDown

    // Set up master event handlers
    activateMasterEvents()
  }
}

// ------------------------------------------------------------------------------
// Program start
// ------------------------------------------------------------------------------

const gui_init = function () {
  try {
    // Create a global GUI object, and initialize it
    const gGui = new CGUI()
    gGui.init()
  } catch (err) {
    alert('Unexpected error: ' + err.message)
  }
}

export { gui_init }

// Get n samples of wave data at time t [s]. Wave data in range [-2,2].
function getData (audioGenerator, t, n) {
  const i = 2 * Math.floor(t * 44100)
  const d = new Array(n)
  const mixBuf = audioGenerator.mixBuf
  for (let j = 0; j < 2 * n; j += 1) {
    const k = i + j
    const pos = k * 2
    let val
    if (pos < mixBuf.length) {
      val = (4 * (mixBuf[pos] + (mixBuf[pos + 1] << 8) - 32768)) / 32768
    } else {
      val = 0
    }
    d[j] = val
  }
  return d
}
