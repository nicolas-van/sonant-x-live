//------------------------------------------------------------------------------
// -*- mode: javascript; tab-width: 2; indent-tabs-mode: nil; -*-
//------------------------------------------------------------------------------
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

//------------------------------------------------------------------------------
// Local classes for easy access to binary data
//------------------------------------------------------------------------------

(function() {
var audioCtx = window.AudioContext ? new AudioContext() : null;

var CBinParser = function (d)
{
  var mData = d;
  var mPos = 0;

  this.getUBYTE = function ()
  {
    return mData.charCodeAt(mPos++) & 255;
  };

  this.getULONG = function ()
  {
    var l = (mData.charCodeAt(mPos) & 255) |
            ((mData.charCodeAt(mPos + 1) & 255) << 8) |
            ((mData.charCodeAt(mPos + 2) & 255) << 16) |
            ((mData.charCodeAt(mPos + 3) & 255) << 24);
    mPos += 4;
    return l;
  };

  this.getFLOAT = function ()
  {
    var l = this.getULONG();
    if (l == 0) return 0;
    var s = l & 0x80000000;                       // Sign
    var e = (l >> 23) & 255;                      // Exponent
    var m = 1 + ((l & 0x007fffff) / 0x00800000);  // Mantissa
    var x = m * Math.pow(2, e - 127);
    return s ? -x : x;
  };
};

var CBinWriter = function ()
{
  var mData = "";

  this.putUBYTE = function (x)
  {
    mData += String.fromCharCode(x);
  };

  this.putULONG = function (x)
  {
    mData += String.fromCharCode(
               x & 255,
               (x >> 8) & 255,
               (x >> 16) & 255,
               (x >> 24) & 255
             );
  };

  this.putFLOAT = function (x)
  {
    var l = 0;
    if (x != 0)
    {
      var s = 0;
      if (x < 0) s = 0x80000000, x = -x;
      var e = 127 + 23;
      while (x < 0x00800000)
      {
        x *= 2;
        e--;
      }
      while (x >= 0x01000000)
      {
        x /= 2;
        e++;
      }
      l = s | ((e & 255) << 23) | (x & 0x007fffff);
    }
    this.putULONG(l);
  };

  this.getData = function ()
  {
    return mData;
  };
};


//------------------------------------------------------------------------------
// GUI class
//------------------------------------------------------------------------------

var CGUI = function()
{
  // Edit modes
  var EDIT_NONE = 0,
      EDIT_SEQUENCE = 1,
      EDIT_PATTERN = 2;

  // Edit/gui state
  var mEditMode = EDIT_SEQUENCE,
      mKeyboardOctave = 5,
      mPatternRow = 0,
      mPatternRow2 = 0,
      mSeqCol = 0,
      mSeqRow = 0,
      mSeqCol2 = 0,
      mSeqRow2 = 0,
      mSelectingSeqRange = false,
      mSelectingPatternRange = false,
      mSeqCopyBuffer = [],
      mPatCopyBuffer = [];

  // Resources
  var mSong = {};
  var mAudio = null;
  var mAudioGenerator = null;
  var mPlayGfxVUImg = new Image();
  var mPlayGfxLedOffImg = new Image();
  var mPlayGfxLedOnImg = new Image();

  // Constant look-up-tables
  var mNoteNames = [
    'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'
  ];

  var mBlackKeyPos = [
    20, 1, 46, 3, 72, 5, 110, 8, 138, 10, 178, 13, 204, 15, 230, 17, 270, 20,
    298, 22, 338, 25, 364, 27, 390, 29, 428, 32, 456, 34
  ];

  // Prealoaded resources
  var mPreload = [];


  //--------------------------------------------------------------------------
  // Song import/export functions
  //--------------------------------------------------------------------------

  var calcSongLength = function (song)
  {
    return Math.round((song.endPattern * 32 + 8) * song.rowLen / 44100);
  };

  var calcSamplesPerRow = function (bpm)
  {
    return Math.round((60 * 44100 / 4) / bpm);
  };

  var getBPM = function ()
  {
    return Math.round((60 * 44100 / 4) / mSong.rowLen);
  };

  var makeNewSong = function ()
  {
    var song = {};

    // Row length
    song.rowLen = calcSamplesPerRow(120);
  
    // All 8 instruments
    song.songData = [];
    var i, j, k, instr, col;
    for (i = 0; i < 8; i++)
    {
      instr = {};
  
      // Oscillator 1
      instr.osc1_oct = 7;
      instr.osc1_det = 0;
      instr.osc1_detune = 0;
      instr.osc1_xenv = 0;
      instr.osc1_vol = 192;
      instr.osc1_waveform = 0;
      // Oscillator 2
      instr.osc2_oct = 7;
      instr.osc2_det = 0;
      instr.osc2_detune = 0;
      instr.osc2_xenv = 0;
      instr.osc2_vol = 192;
      instr.osc2_waveform = 0;
      // Noise oscillator
      instr.noise_fader = 0;
      // Envelope
      instr.env_attack = 200;
      instr.env_sustain = 2000;
      instr.env_release = 20000;
      instr.env_master = 192;
      // Effects
      instr.fx_filter = 0;
      instr.fx_freq = 11025;
      instr.fx_resonance = 255;
      instr.fx_delay_time = 0;
      instr.fx_delay_amt = 0;
      instr.fx_pan_freq = 0;
      instr.fx_pan_amt = 0;
      // LFO
      instr.lfo_osc1_freq = 0;
      instr.lfo_fx_freq = 0;
      instr.lfo_freq = 0;
      instr.lfo_amt = 0;
      instr.lfo_waveform = 0;
  
      // Patterns
      instr.p = [];
      for (j = 0; j < 48; j++)
      {
        instr.p[j] = 0;
      }
  
      // Columns
      instr.c = [];
      for (j = 0; j < 10; j++)
      {
        col = {};
        col.n = [];
        for (k = 0; k < 32; k++)
        {
          col.n[k] = 0;
        }
        instr.c[j] = col;
      }
  
      song.songData[i] = instr;
    }
  
    // Last pattern to play
    song.endPattern = 2;

    // Calculate song length (not really part of the binary song data)
    song.songLen = calcSongLength(song);

    return song;
  };

  var binToSong = function (d)
  {
    var bin = new CBinParser(d);
    var song = {};

    // Row length
    song.rowLen = bin.getULONG();
  
    // All 8 instruments
    song.songData = [];
    var i, j, k, instr, col;
    for (i = 0; i < 8; i++)
    {
      instr = {};
  
      // Oscillator 1
      instr.osc1_oct = bin.getUBYTE();
      instr.osc1_det = bin.getUBYTE();
      instr.osc1_detune = bin.getUBYTE();
      instr.osc1_xenv = bin.getUBYTE();
      instr.osc1_vol = bin.getUBYTE();
      instr.osc1_waveform = bin.getUBYTE();
      // Oscillator 2
      instr.osc2_oct = bin.getUBYTE();
      instr.osc2_det = bin.getUBYTE();
      instr.osc2_detune = bin.getUBYTE();
      instr.osc2_xenv = bin.getUBYTE();
      instr.osc2_vol = bin.getUBYTE();
      instr.osc2_waveform = bin.getUBYTE();
      // Noise oscillator
      instr.noise_fader = bin.getUBYTE();
      bin.getUBYTE(); // Pad!
      bin.getUBYTE(); // Pad!
      bin.getUBYTE(); // Pad!
      // Envelope
      instr.env_attack = bin.getULONG();
      instr.env_sustain = bin.getULONG();
      instr.env_release = bin.getULONG();
      instr.env_master = bin.getUBYTE();
      // Effects
      instr.fx_filter = bin.getUBYTE();
      bin.getUBYTE(); // Pad!
      bin.getUBYTE(); // Pad!
      instr.fx_freq = bin.getFLOAT();
      instr.fx_resonance = bin.getUBYTE();
      instr.fx_delay_time = bin.getUBYTE();
      instr.fx_delay_amt = bin.getUBYTE();
      instr.fx_pan_freq = bin.getUBYTE();
      instr.fx_pan_amt = bin.getUBYTE();
      // LFO
      instr.lfo_osc1_freq = bin.getUBYTE();
      instr.lfo_fx_freq = bin.getUBYTE();
      instr.lfo_freq = bin.getUBYTE();
      instr.lfo_amt = bin.getUBYTE();
      instr.lfo_waveform = bin.getUBYTE();
  
      // Patterns
      instr.p = [];
      for (j = 0; j < 48; j++)
      {
        instr.p[j] = bin.getUBYTE();
      }
  
      // Columns
      instr.c = [];
      for (j = 0; j < 10; j++)
      {
        col = {};
        col.n = [];
        for (k = 0; k < 32; k++)
        {
          col.n[k] = bin.getUBYTE();
        }
        instr.c[j] = col;
      }
  
      bin.getUBYTE(); // Pad!
      bin.getUBYTE(); // Pad!
  
      song.songData[i] = instr;
    }
  
    // Last pattern to play
    song.endPattern = bin.getUBYTE() + 2;

    // Calculate song length (not really part of the binary song data)
    song.songLen = calcSongLength(song);

    return song;
  };

  var songToBin = function (song)
  {
    var bin = new CBinWriter();

    // Row length
    bin.putULONG(song.rowLen);
  
    // All 8 instruments
    var i, j, k, instr, col;
    for (i = 0; i < 8; i++)
    {
      instr = song.songData[i];
  
      // Oscillator 1
      bin.putUBYTE(instr.osc1_oct);
      bin.putUBYTE(instr.osc1_det);
      bin.putUBYTE(instr.osc1_detune);
      bin.putUBYTE(instr.osc1_xenv);
      bin.putUBYTE(instr.osc1_vol);
      bin.putUBYTE(instr.osc1_waveform);
      // Oscillator 2
      bin.putUBYTE(instr.osc2_oct);
      bin.putUBYTE(instr.osc2_det);
      bin.putUBYTE(instr.osc2_detune);
      bin.putUBYTE(instr.osc2_xenv);
      bin.putUBYTE(instr.osc2_vol);
      bin.putUBYTE(instr.osc2_waveform);
      // Noise oscillator
      bin.putUBYTE(instr.noise_fader);
      bin.putUBYTE(0); // Pad!
      bin.putUBYTE(0); // Pad!
      bin.putUBYTE(0); // Pad!
      // Envelope
      bin.putULONG(instr.env_attack);
      bin.putULONG(instr.env_sustain);
      bin.putULONG(instr.env_release);
      bin.putUBYTE(instr.env_master);
      // Effects
      bin.putUBYTE(instr.fx_filter);
      bin.putUBYTE(0); // Pad!
      bin.putUBYTE(0); // Pad!
      bin.putFLOAT(instr.fx_freq);
      bin.putUBYTE(instr.fx_resonance);
      bin.putUBYTE(instr.fx_delay_time);
      bin.putUBYTE(instr.fx_delay_amt);
      bin.putUBYTE(instr.fx_pan_freq);
      bin.putUBYTE(instr.fx_pan_amt);
      // LFO
      bin.putUBYTE(instr.lfo_osc1_freq);
      bin.putUBYTE(instr.lfo_fx_freq);
      bin.putUBYTE(instr.lfo_freq);
      bin.putUBYTE(instr.lfo_amt);
      bin.putUBYTE(instr.lfo_waveform);
  
      // Patterns
      for (j = 0; j < 48; j++)
      {
        bin.putUBYTE(instr.p[j]);
      }
  
      // Columns
      for (j = 0; j < 10; j++)
      {
        col = instr.c[j];
        for (k = 0; k < 32; k++)
        {
          bin.putUBYTE(col.n[k]);
        }
      }
  
      bin.putUBYTE(0); // Pad!
      bin.putUBYTE(0); // Pad!
    }
  
    // Last pattern to play
    bin.putUBYTE(song.endPattern - 2);

    return bin.getData();
  };

  var songToJS = function (song)
  {
    var i, j, k;
    var jsData = "";
  
    jsData += "    // Song data\n";
    jsData += "    var song = {\n";

    jsData += "      // Song length in seconds (how much data to generate)\n";
    jsData += "      songLen: " + song.songLen + ",  // Tune this to fit your needs!\n\n";
  
    jsData += "      songData: [\n";
    for (i = 0; i < 8; i++)
    {
      var instr = song.songData[i];
      jsData += "        { // Instrument " + i + "\n";
      jsData += "          // Oscillator 1\n";
      jsData += "          osc1_oct: " + instr.osc1_oct + ",\n";
      jsData += "          osc1_det: " + instr.osc1_det + ",\n";
      jsData += "          osc1_detune: " + instr.osc1_detune + ",\n";
      jsData += "          osc1_xenv: " + instr.osc1_xenv + ",\n";
      jsData += "          osc1_vol: " + instr.osc1_vol + ",\n";
      jsData += "          osc1_waveform: " + instr.osc1_waveform + ",\n";
      jsData += "          // Oscillator 2\n";
      jsData += "          osc2_oct: " + instr.osc2_oct + ",\n";
      jsData += "          osc2_det: " + instr.osc2_det + ",\n";
      jsData += "          osc2_detune: " + instr.osc2_detune + ",\n";
      jsData += "          osc2_xenv: " + instr.osc2_xenv + ",\n";
      jsData += "          osc2_vol: " + instr.osc2_vol + ",\n";
      jsData += "          osc2_waveform: " + instr.osc2_waveform + ",\n";
      jsData += "          // Noise oscillator\n";
      jsData += "          noise_fader: " + instr.noise_fader + ",\n";
      jsData += "          // Envelope\n";
      jsData += "          env_attack: " + instr.env_attack + ",\n";
      jsData += "          env_sustain: " + instr.env_sustain + ",\n";
      jsData += "          env_release: " + instr.env_release + ",\n";
      jsData += "          env_master: " + instr.env_master + ",\n";
      jsData += "          // Effects\n";
      jsData += "          fx_filter: " + instr.fx_filter + ",\n";
      jsData += "          fx_freq: " + instr.fx_freq + ",\n";
      jsData += "          fx_resonance: " + instr.fx_resonance + ",\n";
      jsData += "          fx_delay_time: " + instr.fx_delay_time + ",\n";
      jsData += "          fx_delay_amt: " + instr.fx_delay_amt + ",\n";
      jsData += "          fx_pan_freq: " + instr.fx_pan_freq + ",\n";
      jsData += "          fx_pan_amt: " + instr.fx_pan_amt + ",\n";
      jsData += "          // LFO\n";
      jsData += "          lfo_osc1_freq: " + instr.lfo_osc1_freq + ",\n";
      jsData += "          lfo_fx_freq: " + instr.lfo_fx_freq + ",\n";
      jsData += "          lfo_freq: " + instr.lfo_freq + ",\n";
      jsData += "          lfo_amt: " + instr.lfo_amt + ",\n";
      jsData += "          lfo_waveform: " + instr.lfo_waveform + ",\n";
      jsData += "          // Patterns\n";
      jsData += "          p: [";
      for (j = 0; j < 48; j++)
      {
        jsData += instr.p[j];
        if (j < 47) jsData += ",";
      }
      jsData += "],\n";
      jsData += "          // Columns\n";
      jsData += "          c: [\n";
      for (j = 0; j < 10; j++)
      {
        jsData += "            {n: [";
        for (k = 0; k < 32; k++)
        {
          jsData += instr.c[j].n[k];
          if (k < 31) jsData += ",";
        }
        jsData += "]}";
        if (j < 9) jsData += ",";
        jsData += "\n";
      }
      jsData += "          ]\n";
      jsData += "        }";
      if (i < 7) jsData += ",";
      jsData += "\n";
    }
    
    jsData += "      ],\n";
    jsData += "      rowLen: " + song.rowLen + ",   // In sample lengths\n";
    jsData += "      endPattern: " + song.endPattern + "  // End pattern\n";
    jsData += "    };\n";

    return jsData;
  };


  //--------------------------------------------------------------------------
  // Helper functions
  //--------------------------------------------------------------------------

  var preloadImage = function (url)
  {
    var img = new Image();
    img.src = url;
    mPreload.push(img);
  };

  var initPresets = function()
  {
    var parent = document.getElementById("instrPreset");
    var o, instr;
    for (var i = 0; i < gInstrumentPresets.length; ++i)
    {
      instr = gInstrumentPresets[i];
      o = document.createElement("option");
      o.value = instr.osc1_oct ? "" + i : "";
      o.appendChild(document.createTextNode(instr.name));
      parent.appendChild(o);
    }
  };

  var getElementPos = function (o)
  {
    var left = 0, top = 0;
    if (o.offsetParent)
    {
      do {
        left += o.offsetLeft;
        top += o.offsetTop;
      } while (o = o.offsetParent);
    }
    return [left, top];
  };

  var getEventElement = function (e)
  {
    var o = null;
    if (!e) var e = window.event;
    if (e.target)
      o = e.target;
    else if (e.srcElement)
      o = e.srcElement;
    if (o.nodeType == 3) // defeat Safari bug
      o = o.parentNode;
    return o;
  };

  var getMousePos = function (e, rel)
  {
    // Get the mouse document position
    var p = [0, 0];
    if (e.pageX || e.pageY)
    {
      p = [e.pageX, e.pageY];
    }
    else if (e.clientX || e.clientY)
    {
      p = [e.clientX + document.body.scrollLeft +
           document.documentElement.scrollLeft,
           e.clientY + document.body.scrollTop +
           document.documentElement.scrollTop];
    }

    if (!rel) return p;

    // Get the element document position
    var pElem = getElementPos(getEventElement(e));
    return [p[0] - pElem[0], p[1] - pElem[1]];
  };

  var unfocusHTMLInputElements = function ()
  {
    document.getElementById("bpm").blur();
    document.getElementById("instrPreset").blur();
  };

  var setEditMode = function (mode)
  {
    mEditMode = mode;

    // Set the style for the different edit sections
    document.getElementById("sequencer").className = (mEditMode == EDIT_SEQUENCE ? "edit" : "");
    document.getElementById("pattern").className = (mEditMode == EDIT_PATTERN ? "edit" : "");

    // Unfocus any focused input elements
    if (mEditMode != EDIT_NONE)
    {
      unfocusHTMLInputElements();
    }
  };

  var updateSongInfo = function()
  {
    var bpm = getBPM();
    document.getElementById("bpm").value = bpm;
  };

  var updateSequencer = function (scrollIntoView, selectionOnly)
  {
    // Update sequencer element contents and selection
    for (var i = 0; i < 48; ++i)
    {
      for (var j = 0; j < 8; ++j)
      {
        var o = document.getElementById("sc" + j + "r" + i);
        if (!selectionOnly)
        {
          var pat = mSong.songData[j].p[i];
          if (pat > 0)
            o.innerHTML = "" + (pat - 1);
          else
            o.innerHTML = "";
        }
        if (i >= mSeqRow && i <= mSeqRow2 &&
            j >= mSeqCol && j <= mSeqCol2)
          o.className ="selected";
        else
          o.className = "";
      }
    }

    // Scroll the row into view? (only when needed)
    if (scrollIntoView)
    {
      var o = document.getElementById("spr" + mSeqRow);
      if (o.scrollIntoView)
      {
        var so = document.getElementById("sequencer");
        var oy = o.offsetTop - so.scrollTop;
        if (oy < 0 || (oy + 10) > so.offsetHeight) o.scrollIntoView(oy < 0);
      }
    }
  };

  var updatePattern = function ()
  {
    var singlePattern = (mSeqCol == mSeqCol2 && mSeqRow == mSeqRow2);
    for (var i = 0; i < 32; ++i)
    {
      var noteName = "";
      var pat = singlePattern ? mSong.songData[mSeqCol].p[mSeqRow] - 1 : -1;
      if (pat >= 0)
      {
        var n = mSong.songData[mSeqCol].c[pat].n[i] - 87;
        if (n > 0)
          noteName = mNoteNames[n % 12] + Math.floor(n / 12);
      }
      var o = document.getElementById("pr" + i);
      o.innerHTML = noteName;
      if (i >= mPatternRow && i <= mPatternRow2)
        o.className ="selected";
      else
        o.className = "";
    }
  };

  var setSelectedPatternRow = function (row)
  {
    mPatternRow = row;
    mPatternRow2 = row;
    for (var i = 0; i < 32; ++i)
    {
      var o = document.getElementById("pr" + i);
      if (i == row)
        o.className ="selected";
      else
        o.className = "";
    }
  };

  var setSelectedPatternRow2 = function (row)
  {
    mPatternRow2 = row >= mPatternRow ? row : mPatternRow;
    for (var i = 0; i < 32; ++i)
    {
      var o = document.getElementById("pr" + i);
      if (i >= mPatternRow && i <= mPatternRow2)
        o.className ="selected";
      else
        o.className = "";
    }
  };

  var setSelectedSequencerCell = function (col, row)
  {
    mSeqCol = col;
    mSeqRow = row;
    mSeqCol2 = col;
    mSeqRow2 = row;
    updateSequencer(true, true);
  };

  var setSelectedSequencerCell2 = function (col, row)
  {
    mSeqCol2 = col >= mSeqCol ? col : mSeqCol;
    mSeqRow2 = row >= mSeqRow ? row : mSeqRow;
    updateSequencer(false, true);
  };

  var addPatternNote = function (n)
  {
    // playNote
    if (mSong && mSeqCol == mSeqCol && mSong.songData[mSeqCol] && mSong.rowLen) {
      var sg = new sonantx.SoundGenerator(mSong.songData[mSeqCol], mSong.rowLen);
      if (! audioCtx) {
        sg.createAudio(n + 87, function(audio) {
          audio.play();
        });
      } else {
        sg.createAudioBuffer(n + 87, function(buffer) {
          var source = audioCtx.createBufferSource(); // Create Sound Source
          source.buffer = buffer; // Add Buffered Data to Object
          source.connect(audioCtx.destination); // Connect Sound Source to Output
          source.start();
        });
      }
    }
    // Edit pattern
    if (mEditMode == EDIT_PATTERN &&
        mSeqCol == mSeqCol2 && mSeqRow == mSeqRow2 &&
        mPatternRow == mPatternRow2)
    {
      var pat = mSong.songData[mSeqCol].p[mSeqRow] - 1;
      if (pat >= 0)
      {
        mSong.songData[mSeqCol].c[pat].n[mPatternRow] = n + 87;
        setSelectedPatternRow((mPatternRow + 1) % 32);
        updatePattern();
        return true;
      }
    }
    return false;
  };

  var updateSlider = function (o, x)
  {
    var props = o.sliderProps;
    var pos = (x - props.min) / (props.max - props.min);
    pos = pos < 0 ? 0 : (pos > 1 ? 1 : pos);
    if (props.nonLinear)
    {
      pos = Math.sqrt(pos);
    }
    o.style.marginLeft = Math.round(191 * pos) + "px";
  };

  var updateCheckBox = function (o, check)
  {
    o.src = check ? "gui/box-check.png" : "gui/box-uncheck.png";
  };

  var clearPresetSelection = function ()
  {
    var o = document.getElementById("instrPreset");
    o.selectedIndex = 0;
  };

  var updateInstrument = function (resetPreset)
  {
    var instr = mSong.songData[mSeqCol];

    // Oscillator 1
    document.getElementById("osc1_wave_sin").src = instr.osc1_waveform == 0 ? "gui/wave-sin-sel.png" : "gui/wave-sin.png";
    document.getElementById("osc1_wave_sqr").src = instr.osc1_waveform == 1 ? "gui/wave-sqr-sel.png" : "gui/wave-sqr.png";
    document.getElementById("osc1_wave_saw").src = instr.osc1_waveform == 2 ? "gui/wave-saw-sel.png" : "gui/wave-saw.png";
    document.getElementById("osc1_wave_tri").src = instr.osc1_waveform == 3 ? "gui/wave-tri-sel.png" : "gui/wave-tri.png";
    updateSlider(document.getElementById("osc1_vol"), instr.osc1_vol);
    updateSlider(document.getElementById("osc1_oct"), instr.osc1_oct);
    updateSlider(document.getElementById("osc1_semi"), instr.osc1_det);
    updateSlider(document.getElementById("osc1_det"), instr.osc1_detune);
    updateCheckBox(document.getElementById("osc1_xenv"), instr.osc1_xenv);

    // Oscillator 2
    document.getElementById("osc2_wave_sin").src = instr.osc2_waveform == 0 ? "gui/wave-sin-sel.png" : "gui/wave-sin.png";
    document.getElementById("osc2_wave_sqr").src = instr.osc2_waveform == 1 ? "gui/wave-sqr-sel.png" : "gui/wave-sqr.png";
    document.getElementById("osc2_wave_saw").src = instr.osc2_waveform == 2 ? "gui/wave-saw-sel.png" : "gui/wave-saw.png";
    document.getElementById("osc2_wave_tri").src = instr.osc2_waveform == 3 ? "gui/wave-tri-sel.png" : "gui/wave-tri.png";
    updateSlider(document.getElementById("osc2_vol"), instr.osc2_vol);
    updateSlider(document.getElementById("osc2_oct"), instr.osc2_oct);
    updateSlider(document.getElementById("osc2_semi"), instr.osc2_det);
    updateSlider(document.getElementById("osc2_det"), instr.osc2_detune);
    updateCheckBox(document.getElementById("osc2_xenv"), instr.osc2_xenv);

    // Noise
    updateSlider(document.getElementById("noise_vol"), instr.noise_fader);

    // Envelope
    updateSlider(document.getElementById("env_master"), instr.env_master);
    updateSlider(document.getElementById("env_att"), instr.env_attack);
    updateSlider(document.getElementById("env_sust"), instr.env_sustain);
    updateSlider(document.getElementById("env_rel"), instr.env_release);

    // LFO
    document.getElementById("lfo_wave_sin").src = instr.lfo_waveform == 0 ? "gui/wave-sin-sel.png" : "gui/wave-sin.png";
    document.getElementById("lfo_wave_sqr").src = instr.lfo_waveform == 1 ? "gui/wave-sqr-sel.png" : "gui/wave-sqr.png";
    document.getElementById("lfo_wave_saw").src = instr.lfo_waveform == 2 ? "gui/wave-saw-sel.png" : "gui/wave-saw.png";
    document.getElementById("lfo_wave_tri").src = instr.lfo_waveform == 3 ? "gui/wave-tri-sel.png" : "gui/wave-tri.png";
    updateSlider(document.getElementById("lfo_amt"), instr.lfo_amt);
    updateSlider(document.getElementById("lfo_freq"), instr.lfo_freq);
    updateCheckBox(document.getElementById("lfo_o1fm"), instr.lfo_osc1_freq);
    updateCheckBox(document.getElementById("lfo_fxfreq"), instr.lfo_fx_freq);

    // Effects
    document.getElementById("fx_filt_lp").src = instr.fx_filter == 2 ? "gui/filt-lp-sel.png" : "gui/filt-lp.png";
    document.getElementById("fx_filt_hp").src = instr.fx_filter == 1 ? "gui/filt-hp-sel.png" : "gui/filt-hp.png";
    document.getElementById("fx_filt_bp").src = instr.fx_filter == 3 ? "gui/filt-bp-sel.png" : "gui/filt-bp.png";
    document.getElementById("fx_filt_n").src = instr.fx_filter == 4 ? "gui/filt-n-sel.png" : "gui/filt-n.png";
    updateSlider(document.getElementById("fx_freq"), instr.fx_freq);
    updateSlider(document.getElementById("fx_res"), instr.fx_resonance);
    updateSlider(document.getElementById("fx_dly_amt"), instr.fx_delay_amt);
    updateSlider(document.getElementById("fx_dly_time"), instr.fx_delay_time);
    updateSlider(document.getElementById("fx_pan_amt"), instr.fx_pan_amt);
    updateSlider(document.getElementById("fx_pan_freq"), instr.fx_pan_freq);

    // Clear the preset selection?
    if (resetPreset)
      clearPresetSelection();
  };

  var updateSongRanges = function ()
  {
    var i, j, emptyRow;

    // Determine the last song pattern
    mSong.endPattern = 49;
    for (i = 47; i >= 0; --i)
    {
      emptyRow = true;
      for (j = 0; j < 8; ++j)
      {
        if (mSong.songData[j].p[i] > 0)
        {
          emptyRow = false;
          break;
        }
      }
      if (!emptyRow) break;
      mSong.endPattern--;
    }

    // Determine song length
    mSong.songLen = calcSongLength(mSong);

    // Determine song speed
    var bpm = parseInt(document.getElementById("bpm").value);
    if (bpm && (bpm > 40) && (bpm < 300))
    {
      mSong.rowLen = calcSamplesPerRow(bpm);
    }
  };

  var showDialog = function ()
  {
    var e = document.getElementById("cover");
    e.style.visibility = "visible";
    deactivateMasterEvents();
  };

  var hideDialog = function ()
  {
    var e = document.getElementById("cover");
    e.style.visibility = "hidden";
    activateMasterEvents();
  };

  var showProgressDialog = function (msg)
  {
    var parent = document.getElementById("dialog");
    parent.innerHTML = "";

    // Create dialog content
    var o, o2;
    o = document.createElement("img");
    o.src = "gui/progress.gif";
    parent.appendChild(o);
    o = document.createTextNode(msg);
    parent.appendChild(o);

    showDialog();
  };

  var showOpenDialog = function ()
  {
    var parent = document.getElementById("dialog");
    parent.innerHTML = "";

    // Create dialog content
    var o;
    o = document.createElement("h3");
    parent.appendChild(o);
    o.appendChild(document.createTextNode("Open file"));
    parent.appendChild(document.createElement("br"));
    var form = document.createElement("form");
    form.method = "post";
    form.enctype = "multipart/form-data";
    form.action = "";
    o = document.createElement("input");
    o.type = "hidden";
    o.name = "MAX_FILE_SIZE";
    o.value = "8000";
    form.appendChild(o);
    o = document.createElement("input");
    o.type = "file";
    o.name = "file";
    o.size = "30";
    o.title = "Binary Sonant file (SNT format)";
    form.appendChild(o);
    form.appendChild(document.createElement("br"));
    o = document.createElement("input");
    o.type = "submit";
    o.value = "Open";
    o.title = "Open song file";
    form.appendChild(o);
    form.appendChild(document.createTextNode(" "));
    o = document.createElement("input");
    o.type = "submit";
    o.value = "Cancel";
    o.onclick = function ()
    {
      hideDialog();
      return false;
    };
    form.appendChild(o);
    parent.appendChild(form);

    showDialog();
  };


  //--------------------------------------------------------------------------
  // Event handlers
  //--------------------------------------------------------------------------

  var newSong = function(e)
  {
    mSong = makeNewSong();

    // Update GUI
    updateSongInfo();
    updateSequencer();
    updatePattern();
    updateInstrument();

    // Initialize the song
    setEditMode(EDIT_SEQUENCE);
    setSelectedPatternRow(0);
    setSelectedSequencerCell(0, 0);
    return false;
  };

  var openSong = function(e)
  {
    showOpenDialog();
    return false;
  };

  var saveSong = function(e)
  {
    // Update song ranges
    updateSongRanges();

    // Generate raw song data
    dataURI = "data:application/octet-stream;base64," + btoa(songToBin(mSong));
    location.href = dataURI;
    return false;
  };

  var exportWAV = function(e)
  {
    // This can hog the browser for quite some time, so warn...
    if (!confirm("This can take quite some time. Do you want to continue?"))
      return;

    // Update song ranges
    updateSongRanges();

    // Generate audio data
    var doneFun = function (wave)
    {
      var uri = "data:application/octet-stream;base64," + btoa(wave);
      window.open(uri);
    };
    generateAudio(doneFun);

    return false;
  };

  var exportWAVRange = function(e)
  {
    // This can hog the browser for quite some time, so warn...
    if (!confirm("This can take quite some time. Do you want to continue?"))
      return;

    // Update song ranges
    updateSongRanges();

    // Select range to play
    var opts = {
      firstRow: mSeqRow,
      lastRow: mSeqRow2,
      firstCol: mSeqCol,
      lastCol: mSeqCol2,
      numSeconds: ((mSeqRow2 - mSeqRow + 1) * 32 + 8) * mSong.rowLen / 44100
    };

    // Generate audio data
    var doneFun = function (wave)
    {
      var uri = "data:application/octet-stream;base64," + btoa(wave);
      window.open(uri);
    };
    generateAudio(doneFun, opts);

    return false;
  };

  var exportJS = function(e)
  {
    // Update song ranges
    updateSongRanges();

    // Generate JS song data
    var dataURI = "data:text/javascript;base64," + btoa(songToJS(mSong));
    window.open(dataURI);
    return false;
  };

  var setStatus = function (msg)
  {
    document.getElementById("statusText").innerHTML = msg;
//    window.status = msg;
  };

  var generateAudio = function (doneFun, opts)
  {
    // Show dialog
    showProgressDialog("Generating sound...");

    // Start time measurement
    var d1 = new Date();

    // Generate audio data\bm
    // NOTE: We'd love to do this in a Web Worker instead! Currently we do it
    // in a setInterval() timer loop instead in order not to block the main UI.
    // TODO: handle correctly opts
    var oSong = _.clone(mSong);
    if (opts) {
      oSong.songData = mSong.songData.slice(opts.firstCol, opts.lastCol + 1);
      oSong.songData = _.map(oSong.songData, function(data) {
        var ndata = _.clone(data);
        ndata.p = data.p.slice(opts.firstRow, opts.lastRow + 1);
        return ndata;
      });
      oSong.endPattern = (opts.lastRow + 1) - opts.firstRow  + 1;
      oSong.songLen = opts.numSeconds;
    }
    var mPlayer = new sonantx.MusicGenerator(oSong);
    mPlayer.getAudioGenerator(function(ag) {
      mAudioGenerator = ag;
      var wave = ag.getWave();
      var d2 = new Date();
      setStatus("Generation time: " + (d2.getTime() - d1.getTime())/1000 + "s");

      // Hide dialog
      hideDialog();

      // Call the callback function
      doneFun(wave);
    });
  };


  //----------------------------------------------------------------------------
  // Playback follower
  //----------------------------------------------------------------------------

  var mFollowerTimerID = -1;
  var mFollowerFirstRow = 0;
  var mFollowerLastRow = 0;
  var mFollowerFirstCol = 0;
  var mFollowerLastCol = 0;
  var mFollowerActive = false;
  var mFollowerLastVULeft = 0;
  var mFollowerLastVURight = 0;

  var getSamplesSinceNote = function (t, chan)
  {
    var nFloat = t * 44100 / mSong.rowLen;
    var n = Math.floor(nFloat);
    var seqPos0 = Math.floor(n / 32) + mFollowerFirstRow;
    var patPos0 = n % 32;
    for (var k = 0; k < 32; ++k)
    {
      var seqPos = seqPos0;
      var patPos = patPos0 - k;
      while (patPos < 0)
      {
        --seqPos;
        if (seqPos < mFollowerFirstRow) return -1;
        patPos += 32;
      }
      var pat = mSong.songData[chan].p[seqPos] - 1;
      if (pat >= 0 && mSong.songData[chan].c[pat].n[patPos] > 0)
      {
        return (k + (nFloat - n)) * mSong.rowLen;
      }
    }
    return -1;
  };

  var redrawPlayerGfx = function (t)
  {
    var o = document.getElementById("playGfxCanvas");
    var w = mPlayGfxVUImg.width > 0 ? mPlayGfxVUImg.width : o.width;
    var h = mPlayGfxVUImg.height > 0 ? mPlayGfxVUImg.height : 51;
    var ctx = o.getContext("2d");
    if (ctx)
    {
      // Draw the VU meter BG
      ctx.drawImage(mPlayGfxVUImg, 0, 0);

      // Calculate singal powers
      var pl = 0, pr = 0;
      if (mFollowerActive && t >= 0)
      {
        // Get the waveform
        var wave = getData(mAudioGenerator, t, 1000);

        // Calculate volume
        var i, l, r;
        var sl = 0, sr = 0, l_old = 0, r_old = 0;
        for (i = 1; i < wave.length; i += 2)
        {
          l = wave[i-1];
          r = wave[i];

          // Band-pass filter (low-pass + high-pass)
          sl = 0.8 * l + 0.1 * sl - 0.3 * l_old;
          sr = 0.8 * r + 0.1 * sr - 0.3 * r_old;
          l_old = l;
          r_old = r;

          // Sum of squares
          pl += sl * sl;
          pr += sr * sr;
        }

        // Low-pass filtered mean power (RMS)
        pl = Math.sqrt(pl / wave.length) * 0.2 + mFollowerLastVULeft * 0.8;
        pr = Math.sqrt(pr / wave.length) * 0.2 + mFollowerLastVURight * 0.8;
        mFollowerLastVULeft = pl;
        mFollowerLastVURight = pr;
      }

      // Convert to angles in the VU meter
      var a1 = pl > 0 ? 1.3 + 0.5 * Math.log(pl) : -1000;
      a1 = a1 < -1 ? -1 : a1 > 1 ? 1 : a1;
      a1 *= 0.57;
      var a2 = pr > 0 ? 1.3 + 0.5 * Math.log(pr) : -1000;
      a2 = a2 < -1 ? -1 : a2 > 1 ? 1 : a2;
      a2 *= 0.57;

      // Draw VU hands
      ctx.strokeStyle = "rgb(0,0,0)";
      ctx.beginPath();
      ctx.moveTo(w * 0.25, h * 2.1);
      ctx.lineTo(w * 0.25 + h * 1.8 * Math.sin(a1), h * 2.1 - h * 1.8 * Math.cos(a1));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.75, h * 2.1);
      ctx.lineTo(w * 0.75 + h * 1.8 * Math.sin(a2), h * 2.1 - h * 1.8 * Math.cos(a2));
      ctx.stroke();

      // Draw leds
      ctx.fillStyle = "rgb(0,0,0)";
      ctx.fillRect(0, h, w, 20);
      for (i = 0; i < 8; ++i)
      {
        // Draw un-lit led
        var x = Math.round(26 + 26.5 * i);
        ctx.drawImage(mPlayGfxLedOffImg, x, h);

        if (i >= mFollowerFirstCol && i <= mFollowerLastCol)
        {
          // Get envelope profile for this channel
          var env_a = mSong.songData[i].env_attack,
              env_r = mSong.songData[i].env_sustain + mSong.songData[i].env_release,
              env_tot = env_a + env_r;
          if (env_tot < 10000)
          {
            env_tot = 10000;
            env_r = env_tot - env_a;
          }

          // Get number of samples since last new note
          var numSamp = getSamplesSinceNote(t, i);
          if (numSamp >= 0 && numSamp < env_tot)
          {
            // Calculate current envelope (same method as the synth, except sustain)
            var alpha;
            if (numSamp < env_a)
              alpha = numSamp / env_a;
            else
              alpha = 1 - (numSamp - env_a) / env_r;

            // Draw lit led with alpha blending
            ctx.globalAlpha = alpha * alpha;
            ctx.drawImage(mPlayGfxLedOnImg, x, h);
            ctx.globalAlpha = 1.0;
          }
        }
      }
    }
  };

  var updateFollower = function ()
  {
    if (mAudio == null) return;

    // Calculate current song position
    var t = mAudio.currentTime;
    var n = Math.floor(t * 44100 / mSong.rowLen);
    var seqPos = Math.floor(n / 32) + mFollowerFirstRow;
    var patPos = n % 32;

    // Are we past the play range (i.e. stop the follower?)
    if (seqPos > mFollowerLastRow)
    {
      stopFollower();

      // Reset pattern position
      mPatternRow = 0;
      mPatternRow2 = 0;
      updatePattern();

      return;
    }

    var newSeqPos = (seqPos != mSeqRow);
    var newPatPos = newSeqPos || (patPos != mPatternRow);

    // Update the sequencer
    if (newSeqPos)
    {
      if (seqPos >= 0)
      {
        mSeqRow = seqPos;
        mSeqRow2 = seqPos;
        updateSequencer(true, true);
      }
      for (var i = 0; i < 48; ++i)
      {
        var o = document.getElementById("spr" + i);
        o.className = (i == seqPos ? "playpos" : "");
      }
    }

    // Update the pattern
    if (newPatPos)
    {
      if (patPos >= 0)
      {
        mPatternRow = patPos;
        mPatternRow2 = patPos;
        updatePattern();
      }
      for (var i = 0; i < 32; ++i)
      {
        var o = document.getElementById("ppr" + i);
        o.className = (i == patPos ? "playpos" : "");
      }
    }

    // Player graphics
    redrawPlayerGfx(t);
  };

  var startFollower = function ()
  {
    // Update the sequencer selection
    mSeqRow = mFollowerFirstRow;
    mSeqRow2 = mFollowerFirstRow;
    mSeqCol2 = mSeqCol;
    updateSequencer(true, true);
    updatePattern();

    // Start the follower
    mFollowerActive = true;
    mFollowerTimerID = setInterval(updateFollower, 16);
  };

  var stopFollower = function ()
  {
    if (mFollowerActive)
    {
      // Stop the follower
      if (mFollowerTimerID !== -1)
      {
        clearInterval(mFollowerTimerID);
        mFollowerTimerID = -1;
      }

      // Clear the follower markers
      for (var i = 0; i < 48; ++i)
      {
        document.getElementById("spr" + i).className = "";
      }
      for (var i = 0; i < 32; ++i)
      {
        document.getElementById("ppr" + i).className = "";
      }

      // Clear player gfx
      redrawPlayerGfx(-1);

      mFollowerActive = false;
    }
  };

  //----------------------------------------------------------------------------
  // (end of playback follower)
  //----------------------------------------------------------------------------


  var playSong = function (e)
  {
    // Stop the currently playing audio
    stopPlaying();

    // Update song ranges
    updateSongRanges();

    // Select range to play
    mFollowerFirstRow = 0;
    mFollowerLastRow = mSong.endPattern - 2;
    mFollowerFirstCol = 0;
    mFollowerLastCol = 7;

    // Generate audio data
    var doneFun = function (wave)
    {
      if (mAudio == null)
      {
         alert("Audio element unavailable.");
         return;
      }

      try
      {
        var uri = "data:audio/wav;base64," + btoa(wave);

        // Start the follower
        startFollower();

        // Load the data into the audio element (it will start playing as soon as
        // the data has been loaded)
        mAudio.src = uri;

        // Hack
        mAudio.play();
      }
      catch (err)
      {
        alert("Error playing: " + err.message);
      }
    };
    generateAudio(doneFun);

    return false;
  };

  var playRange = function (e)
  {
    // Stop the currently playing audio
    stopPlaying();

    // Update song ranges
    updateSongRanges();

    // Select range to play
    var opts = {
      firstRow: mSeqRow,
      lastRow: mSeqRow2,
      firstCol: mSeqCol,
      lastCol: mSeqCol2,
      numSeconds: ((mSeqRow2 - mSeqRow + 1) * 32 + 8) * mSong.rowLen / 44100
    };
    mFollowerFirstRow = mSeqRow;
    mFollowerLastRow = mSeqRow2;
    mFollowerFirstCol = mSeqCol;
    mFollowerLastCol = mSeqCol2;

    // Generate audio data
    var doneFun = function (wave)
    {
      if (mAudio == null)
      {
         alert("Audio element unavailable.");
         return;
      }

      try
      {
        var uri = "data:audio/wav;base64," + btoa(wave);

        // Restart the follower
        startFollower();

        // Load the data into the audio element (it will start playing as soon as
        // the data has been loaded)
        mAudio.src = uri;

        // Hack
        mAudio.play();
      }
      catch (err)
      {
        alert("Error playing: " + err.message);
      }
    };
    generateAudio(doneFun, opts);

    return false;
  };

  var stopPlaying = function (e)
  {
    if (mAudio == null)
    {
       alert("Audio element unavailable.");
       return;
    }

    stopFollower();

    mAudio.pause();
    return false;
  };

  var bpmFocus = function (e)
  {
    setEditMode(EDIT_NONE);
    return true;
  };

  var instrPresetFocus = function (e)
  {
    setEditMode(EDIT_NONE);
    return true;
  };

  var patternCopyMouseDown = function (e)
  {
    if (mSeqRow == mSeqRow2 && mSeqCol == mSeqCol2)
    {
      var pat = mSong.songData[mSeqCol].p[mSeqRow] - 1;
      if (pat >= 0)
      {
        mPatCopyBuffer = [];
        for (var row = mPatternRow; row <= mPatternRow2; ++row)
        {
          mPatCopyBuffer.push(mSong.songData[mSeqCol].c[pat].n[row]);
        }
      }
    }
    return false;
  };

  var patternPasteMouseDown = function (e)
  {
    if (mSeqRow == mSeqRow2 && mSeqCol == mSeqCol2)
    {
      var pat = mSong.songData[mSeqCol].p[mSeqRow] - 1;
      if (pat >= 0)
      {
        for (var row = mPatternRow, i = 0; row < 32 && i < mPatCopyBuffer.length; ++row, ++i)
        {
          mSong.songData[mSeqCol].c[pat].n[row] = mPatCopyBuffer[i];
        }
        updatePattern();
      }
    }
    return false;
  };

  var patternNoteUpMouseDown = function (e)
  {
    if (mSeqRow == mSeqRow2 && mSeqCol == mSeqCol2)
    {
      var pat = mSong.songData[mSeqCol].p[mSeqRow] - 1;
      if (pat >= 0)
      {
        for (var row = mPatternRow; row <= mPatternRow2; ++row)
        {
          var n = mSong.songData[mSeqCol].c[pat].n[row];
          if (n > 0)
          {
            mSong.songData[mSeqCol].c[pat].n[row] = n + 1;
          }
        }
        updatePattern();
      }
    }
    return false;
  };

  var patternNoteDownMouseDown = function (e)
  {
    if (mSeqRow == mSeqRow2 && mSeqCol == mSeqCol2)
    {
      var pat = mSong.songData[mSeqCol].p[mSeqRow] - 1;
      if (pat >= 0)
      {
        for (var row = mPatternRow; row <= mPatternRow2; ++row)
        {
          var n = mSong.songData[mSeqCol].c[pat].n[row];
          if (n > 1)
          {
            mSong.songData[mSeqCol].c[pat].n[row] = n - 1;
          }
        }
        updatePattern();
      }
    }
    return false;
  };

  var patternOctaveUpMouseDown = function (e)
  {
    if (mSeqRow == mSeqRow2 && mSeqCol == mSeqCol2)
    {
      var pat = mSong.songData[mSeqCol].p[mSeqRow] - 1;
      if (pat >= 0)
      {
        for (var row = mPatternRow; row <= mPatternRow2; ++row)
        {
          var n = mSong.songData[mSeqCol].c[pat].n[row];
          if (n > 0)
          {
            mSong.songData[mSeqCol].c[pat].n[row] = n + 12;
          }
        }
        updatePattern();
      }
    }
    return false;
  };

  var patternOctaveDownMouseDown = function (e)
  {
    if (mSeqRow == mSeqRow2 && mSeqCol == mSeqCol2)
    {
      var pat = mSong.songData[mSeqCol].p[mSeqRow] - 1;
      if (pat >= 0)
      {
        for (var row = mPatternRow; row <= mPatternRow2; ++row)
        {
          var n = mSong.songData[mSeqCol].c[pat].n[row];
          if (n > 1)
          {
            mSong.songData[mSeqCol].c[pat].n[row] = n - 12;
          }
        }
        updatePattern();
      }
    }
    return false;
  };

  var sequencerCopyMouseDown = function (e)
  {
    mSeqCopyBuffer = [];
    for (var row = mSeqRow; row <= mSeqRow2; ++row)
    {
      var arr = [];
      for (var col = mSeqCol; col <= mSeqCol2; ++col)
      {
        arr.push(mSong.songData[col].p[row]);
      }
      mSeqCopyBuffer.push(arr);
    }
    return false;
  };

  var sequencerPasteMouseDown = function (e)
  {
    for (var row = mSeqRow, i = 0; row < 48 && i < mSeqCopyBuffer.length; ++row, ++i)
    {
      for (var col = mSeqCol, j = 0; col < 8 && j < mSeqCopyBuffer[i].length; ++col, ++j)
      {
        mSong.songData[col].p[row] = mSeqCopyBuffer[i][j];
      }
    }
    updateSequencer();
    return false;
  };

  var sequencerPatUpMouseDown = function (e)
  {
    for (var row = mSeqRow; row <= mSeqRow2; ++row)
    {
      for (var col = mSeqCol; col <= mSeqCol2; ++col)
      {
        var pat = mSong.songData[col].p[row];
        if (pat < 10)
        {
          mSong.songData[col].p[row] = pat + 1;
        }
      }
    }
    updateSequencer();
    return false;
  };

  var sequencerPatDownMouseDown = function (e)
  {
    for (var row = mSeqRow; row <= mSeqRow2; ++row)
    {
      for (var col = mSeqCol; col <= mSeqCol2; ++col)
      {
        var pat = mSong.songData[col].p[row];
        if (pat > 0)
        {
          mSong.songData[col].p[row] = pat - 1;
        }
      }
    }
    updateSequencer();
    return false;
  };

  var boxMouseDown = function (e)
  {
    if (mSeqCol == mSeqCol2)
    {
      if (!e) var e = window.event;
      var o = getEventElement(e);
      if (o.id === "osc1_xenv")
        mSong.songData[mSeqCol].osc1_xenv = mSong.songData[mSeqCol].osc1_xenv ? 0 : 1;
      else if (o.id === "osc2_xenv")
        mSong.songData[mSeqCol].osc2_xenv = mSong.songData[mSeqCol].osc2_xenv ? 0 : 1;
      else if (o.id === "lfo_o1fm")
        mSong.songData[mSeqCol].lfo_osc1_freq = mSong.songData[mSeqCol].lfo_osc1_freq ? 0 : 1;
      else if (o.id === "lfo_fxfreq")
        mSong.songData[mSeqCol].lfo_fx_freq = mSong.songData[mSeqCol].lfo_fx_freq ? 0 : 1;
      updateInstrument(true);
      unfocusHTMLInputElements();
      return false;
    }
    return true;
  };

  var osc1WaveMouseDown = function (e)
  {
    if (mSeqCol == mSeqCol2)
    {
      if (!e) var e = window.event;
      var o = getEventElement(e);
      var wave = 0;
      if (o.id === "osc1_wave_sin") wave = 0;
      else if (o.id === "osc1_wave_sqr") wave = 1;
      else if (o.id === "osc1_wave_saw") wave = 2;
      else if (o.id === "osc1_wave_tri") wave = 3;
      mSong.songData[mSeqCol].osc1_waveform = wave;
      updateInstrument();
      unfocusHTMLInputElements();
      return false;
    }
    return true;
  };

  var osc2WaveMouseDown = function (e)
  {
    if (mSeqCol == mSeqCol2)
    {
      if (!e) var e = window.event;
      var o = getEventElement(e);
      var wave = 0;
      if (o.id === "osc2_wave_sin") wave = 0;
      else if (o.id === "osc2_wave_sqr") wave = 1;
      else if (o.id === "osc2_wave_saw") wave = 2;
      else if (o.id === "osc2_wave_tri") wave = 3;
      mSong.songData[mSeqCol].osc2_waveform = wave;
      updateInstrument(true);
      unfocusHTMLInputElements();
      return false;
    }
    return true;
  };

  var lfoWaveMouseDown = function (e)
  {
    if (mSeqCol == mSeqCol2)
    {
      if (!e) var e = window.event;
      var o = getEventElement(e);
      var wave = 0;
      if (o.id === "lfo_wave_sin") wave = 0;
      else if (o.id === "lfo_wave_sqr") wave = 1;
      else if (o.id === "lfo_wave_saw") wave = 2;
      else if (o.id === "lfo_wave_tri") wave = 3;
      mSong.songData[mSeqCol].lfo_waveform = wave;
      updateInstrument(true);
      unfocusHTMLInputElements();
      return false;
    }
    return true;
  };

  var fxFiltMouseDown = function (e)
  {
    if (mSeqCol == mSeqCol2)
    {
      if (!e) var e = window.event;
      var o = getEventElement(e);
      var filt = 0;
      if (o.id === "fx_filt_hp") filt = 1;
      else if (o.id === "fx_filt_lp") filt = 2;
      else if (o.id === "fx_filt_bp") filt = 3;
      else if (o.id === "fx_filt_n") filt = 4;
      if (mSong.songData[mSeqCol].fx_filter !== filt)
        mSong.songData[mSeqCol].fx_filter = filt;
      else
        mSong.songData[mSeqCol].fx_filter = 0;
      updateInstrument(true);
      unfocusHTMLInputElements();
      return false;
    }
    return true;
  };

  var octaveUp = function (e)
  {
    if (mKeyboardOctave < 8)
    {
      mKeyboardOctave++;
      document.getElementById("keyboardOctave").innerHTML = "" + mKeyboardOctave;
    }
    return false;
  };

  var octaveDown = function (e)
  {
    if (mKeyboardOctave > 1)
    {
      mKeyboardOctave--;
      document.getElementById("keyboardOctave").innerHTML = "" + mKeyboardOctave;
    }
    return false;
  };

  var selectPreset = function (e)
  {
    if (mSeqCol == mSeqCol2)
    {
      if (!e) var e = window.event;
      var o = getEventElement(e);
      var val = o.options[o.selectedIndex].value;
      if (val !== "")
      {
        val = parseInt(val);
        if (val)
        {
          // Clone instrument settings
          var src = gInstrumentPresets[val];
          mSong.songData[mSeqCol].osc1_oct = src.osc1_oct;
          mSong.songData[mSeqCol].osc1_det = src.osc1_det;
          mSong.songData[mSeqCol].osc1_detune = src.osc1_detune;
          mSong.songData[mSeqCol].osc1_xenv = src.osc1_xenv;
          mSong.songData[mSeqCol].osc1_vol = src.osc1_vol;
          mSong.songData[mSeqCol].osc1_waveform = src.osc1_waveform;
          mSong.songData[mSeqCol].osc2_oct = src.osc2_oct;
          mSong.songData[mSeqCol].osc2_det = src.osc2_det;
          mSong.songData[mSeqCol].osc2_detune = src.osc2_detune;
          mSong.songData[mSeqCol].osc2_xenv = src.osc2_xenv;
          mSong.songData[mSeqCol].osc2_vol = src.osc2_vol;
          mSong.songData[mSeqCol].osc2_waveform = src.osc2_waveform;
          mSong.songData[mSeqCol].noise_fader = src.noise_fader;
          mSong.songData[mSeqCol].env_attack = src.env_attack;
          mSong.songData[mSeqCol].env_sustain = src.env_sustain;
          mSong.songData[mSeqCol].env_release = src.env_release;
          mSong.songData[mSeqCol].env_master = src.env_master;
          mSong.songData[mSeqCol].fx_filter = src.fx_filter;
          mSong.songData[mSeqCol].fx_freq = src.fx_freq;
          mSong.songData[mSeqCol].fx_resonance = src.fx_resonance;
          mSong.songData[mSeqCol].fx_delay_time = src.fx_delay_time;
          mSong.songData[mSeqCol].fx_delay_amt = src.fx_delay_amt;
          mSong.songData[mSeqCol].fx_pan_freq = src.fx_pan_freq;
          mSong.songData[mSeqCol].fx_pan_amt = src.fx_pan_amt;
          mSong.songData[mSeqCol].lfo_osc1_freq = src.lfo_osc1_freq;
          mSong.songData[mSeqCol].lfo_fx_freq = src.lfo_fx_freq;
          mSong.songData[mSeqCol].lfo_freq = src.lfo_freq;
          mSong.songData[mSeqCol].lfo_amt = src.lfo_amt;
          mSong.songData[mSeqCol].lfo_waveform = src.lfo_waveform;

          updateInstrument(false);
          return false;
        }
      }
    }
    return true;
  };

  var keyboardMouseDown = function (e)
  {
    if (!e) var e = window.event;
    var p = getMousePos(e, true);

    // Calculate keyboard position
    var n = 0;
    if (p[1] < 67)
    {
      // Possible black key
      for (var i = 0; i < mBlackKeyPos.length; i += 2)
      {
        if (p[0] >= (mBlackKeyPos[i] - 5) &&
            p[0] <= (mBlackKeyPos[i] + 5))
        {
          n = mBlackKeyPos[i + 1];
          break;
        }
      }
    }
    if (!n)
    {
      // Must be a white key
      n = Math.floor((p[0] * 21) / 475) * 2;
      var comp = 0;
      if (n >= 36) comp++;
      if (n >= 28) comp++;
      if (n >= 22) comp++;
      if (n >= 14) comp++;
      if (n >= 8) comp++;
      n -= comp;
    }

    // Adjust for G-based scale
    n = n - 7;

    // Edit pattern
    if (addPatternNote(n + mKeyboardOctave * 12))
    {
      return false;
    }
  };

  var patternMouseDown = function (e)
  {
    if (!e) var e = window.event;
    if (!mFollowerActive)
    {
      var o = getEventElement(e);
      setSelectedPatternRow(parseInt(o.id.slice(2)));
      mSelectingPatternRange = true;
    }
    setEditMode(EDIT_PATTERN);
    return false;
  };

  var patternMouseOver = function (e)
  {
    if (mSelectingPatternRange)
    {
      if (!e) var e = window.event;
      var o = getEventElement(e);
      setSelectedPatternRow2(parseInt(o.id.slice(2)));
      return false;
    }
    return true;
  };

  var patternMouseUp = function (e)
  {
    if (mSelectingPatternRange)
    {
      if (!e) var e = window.event;
      var o = getEventElement(e);
      setSelectedPatternRow2(parseInt(o.id.slice(2)));
      mSelectingPatternRange = false;
      return false;
    }
    return true;
  };

  var sequencerMouseDown = function (e)
  {
    if (!e) var e = window.event;
    var o = getEventElement(e);
    var col = parseInt(o.id.slice(2,3));
    var row;
    if (!mFollowerActive)
      row = parseInt(o.id.slice(4));
    else
      row = mSeqRow;
    var newChannel = col != mSeqCol || mSeqCol != mSeqCol2;
    setSelectedSequencerCell(col, row);
    if (!mFollowerActive)
      mSelectingSeqRange = true;
    setEditMode(EDIT_SEQUENCE);
    updatePattern();
    updateInstrument(newChannel);
    return false;
  };

  var sequencerMouseOver = function (e)
  {
    if (mSelectingSeqRange)
    {
      if (!e) var e = window.event;
      var o = getEventElement(e);
      var col = parseInt(o.id.slice(2,3));
      var row = parseInt(o.id.slice(4));
      setSelectedSequencerCell2(col, row);
      updatePattern();
      updateInstrument(true);
      return false;
    }
    return true;
  };

  var sequencerMouseUp = function (e)
  {
    if (mSelectingSeqRange)
    {
      if (!e) var e = window.event;
      var o = getEventElement(e);
      var col = parseInt(o.id.slice(2,3));
      var row = parseInt(o.id.slice(4));
      var newChannel = col != mSeqCol2 || mSeqCol != mSeqCol2;
      setSelectedSequencerCell2(col, row);
      mSelectingSeqRange = false;
      updatePattern();
      updateInstrument(newChannel);
      return false;
    }
    return true;
  };

  var mActiveSlider = null;

  var sliderMouseDown = function (e)
  {
    if (mSeqCol == mSeqCol2)
    {
      if (!e) var e = window.event;
      mActiveSlider = getEventElement(e);
      unfocusHTMLInputElements();
      return false;
    }
    return true;
  };

  var mouseMove = function (e)
  {
    if (!e) var e = window.event;

    // Handle slider?
    if (mActiveSlider)
    {
      // Calculate slider position
      var pos = getMousePos(e, false);
      var origin = getElementPos(mActiveSlider.parentNode);
      var x = pos[0] - 6 - origin[0];
      x = x < 0 ? 0 : (x > 191 ? 1 : (x / 191));

      // Adapt to the range of the slider
      if (mActiveSlider.sliderProps.nonLinear)
      {
        x = x * x;
      }
      var min = mActiveSlider.sliderProps.min;
      var max = mActiveSlider.sliderProps.max;
      x = Math.round(min + ((max - min) * x));

      // Update the song property
      var instr = mSong.songData[mSeqCol];
      if (mActiveSlider.id == "osc1_vol") instr.osc1_vol = x;
      else if (mActiveSlider.id == "osc1_oct") instr.osc1_oct = x;
      else if (mActiveSlider.id == "osc1_semi") instr.osc1_det = x;
      else if (mActiveSlider.id == "osc1_det") instr.osc1_detune = x;
      else if (mActiveSlider.id == "osc2_vol") instr.osc2_vol = x;
      else if (mActiveSlider.id == "osc2_oct") instr.osc2_oct = x;
      else if (mActiveSlider.id == "osc2_semi") instr.osc2_det = x;
      else if (mActiveSlider.id == "osc2_det") instr.osc2_detune = x;
      else if (mActiveSlider.id == "noise_vol") instr.noise_fader = x;
      else if (mActiveSlider.id == "env_master") instr.env_master = x;
      else if (mActiveSlider.id == "env_att") instr.env_attack = x;
      else if (mActiveSlider.id == "env_sust") instr.env_sustain = x;
      else if (mActiveSlider.id == "env_rel") instr.env_release = x;
      else if (mActiveSlider.id == "lfo_amt") instr.lfo_amt = x;
      else if (mActiveSlider.id == "lfo_freq") instr.lfo_freq = x;
      else if (mActiveSlider.id == "fx_freq") instr.fx_freq = x;
      else if (mActiveSlider.id == "fx_res") instr.fx_resonance = x;
      else if (mActiveSlider.id == "fx_dly_amt") instr.fx_delay_amt = x;
      else if (mActiveSlider.id == "fx_dly_time") instr.fx_delay_time = x;
      else if (mActiveSlider.id == "fx_pan_amt") instr.fx_pan_amt = x;
      else if (mActiveSlider.id == "fx_pan_freq") instr.fx_pan_freq = x;

      // Update the slider position
      updateSlider(mActiveSlider, x);
      clearPresetSelection();
      return false;
    }
    return true;
  };

  var mouseUp = function (e)
  {
    if (mActiveSlider)
    {
      mActiveSlider = null;
      return false;
    }
    return true;
  };

  var keyDown = function (e)
  {
    if (!e) var e = window.event;

    var row, col, n;

    // Sequencer editing
    if (mEditMode == EDIT_SEQUENCE &&
        mSeqCol == mSeqCol2 && mSeqRow == mSeqRow2)
    {
      // 0 - 9
      if (e.keyCode >= 48 && e.keyCode <= 57)
      {
        mSong.songData[mSeqCol].p[mSeqRow] = e.keyCode - 47;
        updateSequencer();
        updatePattern();
        return false;
      }
    }

    // Pattern editing (not sure how layout sensitive this is)
    if (mEditMode == EDIT_PATTERN &&
        mSeqCol == mSeqCol2 && mSeqRow == mSeqRow2 &&
        mPatternRow == mPatternRow2)
    {
      n = -1;
      switch (e.keyCode)
      {
        // First octave on the ZXCVB... row
        case 90: n = 0; break;
        case 83: n = 1; break;
        case 88: n = 2; break;
        case 68: n = 3; break;
        case 67: n = 4; break;
        case 86: n = 5; break;
        case 71: n = 6; break;
        case 66: n = 7; break;
        case 72: n = 8; break;
        case 78: n = 9; break;
        case 74: n = 10; break;
        case 77: n = 11; break;
        // "Bonus keys" 1 (extensions of first octave into second octave)
        case 188: n = 12; break;
        case 76: n = 13; break;
        case 190: n = 14; break;
        case 186: n = 15; break;
        case 191: n = 16; break;
        // Second octave on the QWERTY... row
        case 81: n = 12; break;
        case 50: n = 13; break;
        case 87: n = 14; break;
        case 51: n = 15; break;
        case 69: n = 16; break;
        case 82: n = 17; break;
        case 53: n = 18; break;
        case 84: n = 19; break;
        case 54: n = 20; break;
        case 89: n = 21; break;
        case 55: n = 22; break;
        case 85: n = 23; break;
        // "Bonus keys" 2 (extensions of second octave into third octave)
        case 73: n = 24; break;
        case 57: n = 25; break;
        case 79: n = 26; break;
        case 48: n = 27; break;
        case 80: n = 28; break;
      }
      if (n >= 0)
      {
        if (addPatternNote(n + mKeyboardOctave * 12))
        {
          return false;
        }
      }
    }

    // The rest of the key presses...
    switch (e.keyCode)
    {
      case 39:  // RIGHT
        if (mEditMode == EDIT_SEQUENCE)
        {
          setSelectedSequencerCell((mSeqCol + 1) % 8, mSeqRow);
          updatePattern();
          updateInstrument(true);
          return false;
        }
        break;

      case 37:  // LEFT
        if (mEditMode == EDIT_SEQUENCE)
        {
          setSelectedSequencerCell((mSeqCol - 1 + 8) % 8, mSeqRow);
          updatePattern();
          updateInstrument(true);
          return false;
        }
        break;

      case 40:  // DOWN
        if (mEditMode == EDIT_SEQUENCE)
        {
          setSelectedSequencerCell(mSeqCol, (mSeqRow + 1) % 48);
          updatePattern();
          return false;
        }
        else if (mEditMode == EDIT_PATTERN)
        {
          setSelectedPatternRow((mPatternRow + 1) % 32);
          return false;
        }
        break;

      case 38:  // UP
        if (mEditMode == EDIT_SEQUENCE)
        {
          setSelectedSequencerCell(mSeqCol, (mSeqRow - 1 + 48) % 48);
          updatePattern();
          return false;
        }
        else if (mEditMode == EDIT_PATTERN)
        {
          setSelectedPatternRow((mPatternRow - 1 + 32) % 32);
          return false;
        }
        break;

      case 36:  // HOME
        if (mEditMode == EDIT_SEQUENCE)
        {
          setSelectedSequencerCell(mSeqCol, 0);
          updatePattern();
          return false;
        }
        else if (mEditMode == EDIT_PATTERN)
        {
          setSelectedPatternRow(0);
          return false;
        }
        break;

      case 35:  // END
        if (mEditMode == EDIT_SEQUENCE)
        {
          setSelectedSequencerCell(mSeqCol, 47);
          updatePattern();
          return false;
        }
        else if (mEditMode == EDIT_PATTERN)
        {
          setSelectedPatternRow(31);
          return false;
        }
        break;

      case 32: // SPACE
        if (mEditMode != EDIT_NONE)
        {
          playRange(e);
          return false;
        }
        break;

      case 46:  // DELETE
        if (mEditMode == EDIT_SEQUENCE)
        {
          for (row = mSeqRow; row <= mSeqRow2; ++row)
          {
            for (col = mSeqCol; col <= mSeqCol2; ++col)
            {
              mSong.songData[col].p[row] = 0;
            }
          }
          updateSequencer();
          updatePattern();
          return false;
        }
        else if (mEditMode == EDIT_PATTERN)
        {
          if (mSeqRow == mSeqRow2 && mSeqCol == mSeqCol2)
          {
            var pat = mSong.songData[mSeqCol].p[mSeqRow] - 1;
            if (pat >= 0)
            {
              for (row = mPatternRow; row <= mPatternRow2; ++row)
              {
                mSong.songData[mSeqCol].c[pat].n[row] = 0;
              }
              if (mPatternRow == mPatternRow2)
              {
                setSelectedPatternRow((mPatternRow + 1) % 32);
              }
              updatePattern();
            }
            return false;
          }
        }
        break;

      default:
        // alert("onkeydown: " + e.keyCode);
        break;
    }

    return true;
  };

  var activateMasterEvents = function ()
  {
    // Set up the master mouse event handlers
    document.onmousedown = null;
    document.onmousemove = mouseMove;
    document.onmouseup = mouseUp;

    // Set up the master key event handler
    document.onkeydown = keyDown;
  };

  var deactivateMasterEvents = function ()
  {
    // Set up the master mouse event handlers
    document.onmousedown = function () { return true; };
    document.onmousemove = null;
    document.onmouseup = null;

    // Set up the master key event handler
    document.onkeydown = null;
  };


  //--------------------------------------------------------------------------
  // Initialization
  //--------------------------------------------------------------------------

  this.init = function ()
  {
    var i, j, o;

    // Preload images
    preloadImage("gui/progress.gif");
    preloadImage("gui/box-uncheck.png");
    preloadImage("gui/box-uncheck.png");
    preloadImage("gui/wave-sin.png");
    preloadImage("gui/wave-sin-sel.png");
    preloadImage("gui/wave-saw.png");
    preloadImage("gui/wave-saw-sel.png");
    preloadImage("gui/wave-sqr.png");
    preloadImage("gui/wave-sqr-sel.png");
    preloadImage("gui/wave-tri.png");
    preloadImage("gui/wave-tri-sel.png");
    preloadImage("gui/filt-lp.png");
    preloadImage("gui/filt-lp-sel.png");
    preloadImage("gui/filt-hp.png");
    preloadImage("gui/filt-hp-sel.png");
    preloadImage("gui/filt-bp.png");
    preloadImage("gui/filt-bp-sel.png");
    preloadImage("gui/filt-n.png");
    preloadImage("gui/filt-n-sel.png");

    // Set up presets
    initPresets();

    // Load images for the play graphics canvas
    mPlayGfxVUImg.onload = function () {
      redrawPlayerGfx(-1);
    };
    mPlayGfxLedOffImg.onload = function () {
      redrawPlayerGfx(-1);
    };
    mPlayGfxVUImg.src = "gui/playGfxBg.png";
    mPlayGfxLedOffImg.src = "gui/led-off.png";
    mPlayGfxLedOnImg.src = "gui/led-on.png";

    // Set up GUI elements
    document.getElementById("osc1_vol").sliderProps = { min: 0, max: 255 };
    document.getElementById("osc1_oct").sliderProps = { min: 0, max: 16 };
    document.getElementById("osc1_semi").sliderProps = { min: 0, max: 11 };
    document.getElementById("osc1_det").sliderProps = { min: 0, max: 255 };
    document.getElementById("osc2_vol").sliderProps = { min: 0, max: 255 };
    document.getElementById("osc2_oct").sliderProps = { min: 0, max: 16 };
    document.getElementById("osc2_semi").sliderProps = { min: 0, max: 11 };
    document.getElementById("osc2_det").sliderProps = { min: 0, max: 255 };
    document.getElementById("noise_vol").sliderProps = { min: 0, max: 255 };
    document.getElementById("env_master").sliderProps = { min: 0, max: 255 };
    document.getElementById("env_att").sliderProps = { min: 0, max: 200000, nonLinear: true };
    document.getElementById("env_sust").sliderProps = { min: 0, max: 200000, nonLinear: true };
    document.getElementById("env_rel").sliderProps = { min: 0, max: 200000, nonLinear: true };
    document.getElementById("lfo_amt").sliderProps = { min: 0, max: 255 };
    document.getElementById("lfo_freq").sliderProps = { min: 0, max: 16 };
    document.getElementById("fx_freq").sliderProps = { min: 0, max: 11025, nonLinear: true };
    document.getElementById("fx_res").sliderProps = { min: 0, max: 255 };
    document.getElementById("fx_dly_amt").sliderProps = { min: 0, max: 255 };
    document.getElementById("fx_dly_time").sliderProps = { min: 0, max: 16 };
    document.getElementById("fx_pan_amt").sliderProps = { min: 0, max: 255 };
    document.getElementById("fx_pan_freq").sliderProps = { min: 0, max: 16 };

    // Create audio element, and always play the audio as soon as it's ready
    try
    {
      mAudio = new Audio();
      mAudio.addEventListener("canplay", function () { this.play(); }, true);
    }
    catch (err)
    {
      mAudio = null;
    }

    // Load the song
    mSong = gLoadedSong;
    updateSongInfo();
    updateSequencer();
    updatePattern();
    updateInstrument(true);

    // Initialize the song
    setEditMode(EDIT_SEQUENCE);
    setSelectedSequencerCell(0, 0);
    setSelectedPatternRow(0);

    // Set up event handlers for the sequencer
    for (i = 0; i < 8; ++i)
    {
      for (j = 0; j < 48; ++j)
      {
        o = document.getElementById("sc" + i + "r" + j);
        o.onmousedown = sequencerMouseDown;
        o.onmouseover = sequencerMouseOver;
        o.onmouseup = sequencerMouseUp;
      }
    }

    // Set up event handlers for the pattern editor
    for (i = 0; i < 32; ++i)
    {
      o = document.getElementById("pr" + i);
      o.onmousedown = patternMouseDown;
      o.onmouseover = patternMouseOver;
      o.onmouseup = patternMouseUp;
    }

    // Misc event handlers
    document.getElementById("newSong").onmousedown = newSong;
    document.getElementById("openSong").onmousedown = openSong;
    document.getElementById("saveSong").onmousedown = saveSong;
    document.getElementById("exportJS").onmousedown = exportJS;
    document.getElementById("exportWAV").onmousedown = exportWAV;
    document.getElementById("exportWAVRange").onmousedown = exportWAVRange;
    document.getElementById("playSong").onmousedown = playSong;
    document.getElementById("playRange").onmousedown = playRange;
    document.getElementById("stopPlaying").onmousedown = stopPlaying;
    document.getElementById("bpm").onfocus = bpmFocus;

    document.getElementById("sequencerCopy").onmousedown = sequencerCopyMouseDown;
    document.getElementById("sequencerPaste").onmousedown = sequencerPasteMouseDown;
    document.getElementById("sequencerPatUp").onmousedown = sequencerPatUpMouseDown;
    document.getElementById("sequencerPatDown").onmousedown = sequencerPatDownMouseDown;

    document.getElementById("patternCopy").onmousedown = patternCopyMouseDown;
    document.getElementById("patternPaste").onmousedown = patternPasteMouseDown;
    document.getElementById("patternNoteUp").onmousedown = patternNoteUpMouseDown;
    document.getElementById("patternNoteDown").onmousedown = patternNoteDownMouseDown;
    document.getElementById("patternOctaveUp").onmousedown = patternOctaveUpMouseDown;
    document.getElementById("patternOctaveDown").onmousedown = patternOctaveDownMouseDown;

    document.getElementById("instrPreset").onfocus = instrPresetFocus;
    document.getElementById("instrPreset").onchange = selectPreset;
    document.getElementById("osc1_wave_sin").onmousedown = osc1WaveMouseDown;
    document.getElementById("osc1_wave_sqr").onmousedown = osc1WaveMouseDown;
    document.getElementById("osc1_wave_saw").onmousedown = osc1WaveMouseDown;
    document.getElementById("osc1_wave_tri").onmousedown = osc1WaveMouseDown;
    document.getElementById("osc1_vol").onmousedown = sliderMouseDown;
    document.getElementById("osc1_oct").onmousedown = sliderMouseDown;
    document.getElementById("osc1_semi").onmousedown = sliderMouseDown;
    document.getElementById("osc1_det").onmousedown = sliderMouseDown;
    document.getElementById("osc1_xenv").onmousedown = boxMouseDown;
    document.getElementById("osc2_wave_sin").onmousedown = osc2WaveMouseDown;
    document.getElementById("osc2_wave_sqr").onmousedown = osc2WaveMouseDown;
    document.getElementById("osc2_wave_saw").onmousedown = osc2WaveMouseDown;
    document.getElementById("osc2_wave_tri").onmousedown = osc2WaveMouseDown;
    document.getElementById("osc2_vol").onmousedown = sliderMouseDown;
    document.getElementById("osc2_oct").onmousedown = sliderMouseDown;
    document.getElementById("osc2_semi").onmousedown = sliderMouseDown;
    document.getElementById("osc2_det").onmousedown = sliderMouseDown;
    document.getElementById("osc2_xenv").onmousedown = boxMouseDown;
    document.getElementById("noise_vol").onmousedown = sliderMouseDown;
    document.getElementById("env_master").onmousedown = sliderMouseDown;
    document.getElementById("env_att").onmousedown = sliderMouseDown;
    document.getElementById("env_sust").onmousedown = sliderMouseDown;
    document.getElementById("env_rel").onmousedown = sliderMouseDown;
    document.getElementById("lfo_wave_sin").onmousedown = lfoWaveMouseDown;
    document.getElementById("lfo_wave_sqr").onmousedown = lfoWaveMouseDown;
    document.getElementById("lfo_wave_saw").onmousedown = lfoWaveMouseDown;
    document.getElementById("lfo_wave_tri").onmousedown = lfoWaveMouseDown;
    document.getElementById("lfo_amt").onmousedown = sliderMouseDown;
    document.getElementById("lfo_freq").onmousedown = sliderMouseDown;
    document.getElementById("lfo_o1fm").onmousedown = boxMouseDown;
    document.getElementById("lfo_fxfreq").onmousedown = boxMouseDown;
    document.getElementById("fx_filt_lp").onmousedown = fxFiltMouseDown;
    document.getElementById("fx_filt_hp").onmousedown = fxFiltMouseDown;
    document.getElementById("fx_filt_bp").onmousedown = fxFiltMouseDown;
    document.getElementById("fx_filt_n").onmousedown = fxFiltMouseDown;
    document.getElementById("fx_freq").onmousedown = sliderMouseDown;
    document.getElementById("fx_res").onmousedown = sliderMouseDown;
    document.getElementById("fx_dly_amt").onmousedown = sliderMouseDown;
    document.getElementById("fx_dly_time").onmousedown = sliderMouseDown;
    document.getElementById("fx_pan_amt").onmousedown = sliderMouseDown;
    document.getElementById("fx_pan_freq").onmousedown = sliderMouseDown;

    document.getElementById("octaveDown").onmousedown = octaveDown;
    document.getElementById("octaveUp").onmousedown = octaveUp;
    document.getElementById("keyboard").onmousedown = keyboardMouseDown;

    // Set up master event handlers
    activateMasterEvents();
  };

};


//------------------------------------------------------------------------------
// Program start
//------------------------------------------------------------------------------

window.gui_init = function()
{
  try
  {
    // Create a global GUI object, and initialize it
    gGui = new CGUI();
    gGui.init();
  }
  catch (err)
  {
    alert("Unexpected error: " + err.message);
  }
}

    // Get n samples of wave data at time t [s]. Wave data in range [-2,2].
function getData(audioGenerator, t, n) {
  var i = 2 * Math.floor(t * 44100);
  var d = new Array(n);
  var mixBuf = audioGenerator.mixBuf;
  for (var j = 0; j < 2*n; j += 1) {
    var k = i + j;
    var pos = k * 2;
    var val;
    if (pos < mixBuf.length) {
        val = (4 * (mixBuf[pos] + (mixBuf[pos + 1] << 8) - 32768)) / 32768;
    } else {
        val = 0;
    }
    d[j] = val;
  }
  return d;
};

})();
