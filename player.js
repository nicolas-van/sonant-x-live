//------------------------------------------------------------------------------
// -*- mode: javascript; tab-width: 4; indent-tabs-mode: nil; -*-
//------------------------------------------------------------------------------
// Sonant Live
//   A music tracker for the web.
//
// This is a port of the Sonant player routine, originally written in C by
// Jake Taylor (Ferris / Youth Uprising).
//------------------------------------------------------------------------------
// Copyright (c) 2008-2009 Jake Taylor
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

var CPlayer = function()
{
    //--------------------------------------------------------------------------
    // Private members
    //--------------------------------------------------------------------------

    // Music
    var mSong;

    // Range information (what to generate)
    var mFirstRow, mLastRow;

    // Generation state variables
    var mCurrentCol, mCurrentRow;

    // Work buffers
    var mChnBufWork, mMixBufWork;

    // Wave data configuration
    var WAVE_SPS = 44100;   // Samples per second
    var WAVE_CHAN = 2;      // Channels
    var WAVE_SIZE = 0;      // Total song size (in samples)
 

    //--------------------------------------------------------------------------
    // Private methods
    //--------------------------------------------------------------------------

    // Oscillators
    var osc_sin = function (value)
    {
        return Math.sin(value * 6.283184);
    };

    var osc_saw = function (value)
    {
        return (value % 1) - 0.5;
    };

    var osc_square = function (value)
    {
        return (value % 1) < 0.5 ? 1 : -1;
    };

    var osc_tri = function (value)
    {
        var v2 = (value % 1) * 4;
        if(v2 < 2) return v2 - 1;
        return 3 - v2;
    };

    // Array of oscillator functions
    var mOscillators =
    [
        osc_sin,
        osc_square,
        osc_saw,
        osc_tri
    ];

    var getnotefreq = function (n)
    {
        return 0.00390625 * Math.pow(1.059463094, n - 128);
    };


    //--------------------------------------------------------------------------
    // Public methods
    //--------------------------------------------------------------------------

    // Initialize buffers etc.
    this.init = function (song, opts)
    {
        // Handle optional arguments
        mFirstRow = 0;
        mLastRow = song.endPattern - 2;
        mFirstCol = 0;
        mLastCol = 7;
        var numSeconds = song.songLen;
        if (opts)
        {
            mFirstRow = opts.firstRow;
            mLastRow = opts.lastRow;
            mFirstCol = opts.firstCol;
            mLastCol = opts.lastCol;
            numSeconds = opts.numSeconds;
        }

        // Prepare song info
        mSong = song;
        WAVE_SIZE = Math.round(WAVE_SPS * numSeconds);

        // Number of lines per second (song speed)
        this.lps = WAVE_SPS / mSong.rowLen;

        // Create work buffers (initially cleared)
        mChnBufWork = new Int32Array(WAVE_SIZE * WAVE_CHAN);
        mMixBufWork = new Int32Array(WAVE_SIZE * WAVE_CHAN);

        // Init iteration state variables
        mCurrentCol = mFirstCol;
        mCurrentRow = mFirstRow;
    };

    // Generate audio data for a single track
    this.generate = function ()
    {
        // Local variables
        var i, j, b, p, row, n, currentpos, cp, c1, c2, low, band, high,
            k, t, lfor, e, x, rsample, f, da, o1t, o2t;

        // Put performance critical items in local variables
        var chnBuf = mChnBufWork,
            mixBuf = mMixBufWork,
            waveSamples = WAVE_SIZE,
            waveWords = WAVE_SIZE * WAVE_CHAN,
            instr = mSong.songData[mCurrentCol],
            rowLen = mSong.rowLen,
            master = (156 / 255) * instr.env_master,
            o1vol = instr.osc1_vol * master,
            o1xenv = instr.osc1_xenv,
            o1lfo = instr.lfo_osc1_freq,
            o2vol = instr.osc2_vol * master,
            o2xenv = instr.osc2_xenv,
            noiseVol = instr.noise_fader * master,
            attack = instr.env_attack,
            sustain = instr.env_sustain,
            release = instr.env_release,
            lfoFreq = Math.pow(2, instr.lfo_freq - 8) / rowLen,
            lfoAmt = instr.lfo_amt / 512,
            panFreq = 6.283184 * Math.pow(2, instr.fx_pan_freq - 8) / rowLen,
            panAmt = instr.fx_pan_amt / 512,
            fxFreq = instr.fx_freq * 3.141592 / WAVE_SPS,
            fxFilter = instr.fx_filter,
            fxLFO = instr.lfo_fx_freq,
            q = instr.fx_resonance / 255,
            oscLFO = mOscillators[instr.lfo_waveform],
            osc1 = mOscillators[instr.osc1_waveform],
            osc2 = mOscillators[instr.osc2_waveform];

        if (mCurrentRow == mFirstRow)
        {
            // Clear channel buffer
            for (b = 0; b < waveWords; b ++)
            {
                chnBuf[b] = 0;
            }
        }

        currentpos = (mCurrentRow - mFirstRow) * 32 * rowLen;
        var loopEnd = mCurrentRow + 8;
        loopEnd = loopEnd > mLastRow ? mLastRow : loopEnd;
        for (p = mCurrentRow; p <= loopEnd; ++p) // Patterns
        {
            cp = instr.p[p];
            for (row = 0; row < 32; ++row) // Pattern rows
            {
                if (cp)
                {
                    n = instr.c[cp - 1].n[row];
                    if (n)
                    {
                        // Calculate note frequencies for the oscillators
                        o1t = getnotefreq(n + (instr.osc1_oct - 8) * 12 + instr.osc1_det) * (1 + 0.0008 * instr.osc1_detune);
                        o2t = getnotefreq(n + (instr.osc2_oct - 8) * 12 + instr.osc2_det) * (1 + 0.0008 * instr.osc2_detune);

                        // Clear state variables
                        low = band = 0;
                        c1 = c2 = 0;

                        // Generate one note (attack + sustain + release)
                        for (j = attack + sustain + release - 1; j >= 0; --j)
                        {
                            k = currentpos + j;

                            // Envelope
                            e = 1;
                            if (j < attack)
                                e = j / attack;
                            else if (j >= attack + sustain)
                                e -= (j - attack - sustain) / release;

                            // LFO
                            lfor = oscLFO(lfoFreq * k) * lfoAmt + 0.5;

                            // Oscillator 1
                            t = o1t;
                            if (o1lfo) t += lfor;
                            if (o1xenv) t *= e * e;
                            c1 += t;
                            rsample = osc1(c1) * o1vol;
                            

                            // Oscillator 2
                            t = o2t;
                            if (o2xenv) t *= e * e;
                            c2 += t;
                            rsample += osc2(c2) * o2vol;

                            // Noise oscillator
                            if (noiseVol) rsample += (2 * Math.random() - 1) * noiseVol * e;

                            rsample *= e;

                            // State variable filter
                            f = fxFreq;
                            if (fxLFO) f *= lfor;
                            f = 1.5 * Math.sin(f);
                            low += f * band;
                            high = q * (rsample - band) - low;
                            band += f * high;
                            switch (fxFilter)
                            {
                                case 1: // Hipass
                                    rsample = high;
                                    break;
                                case 2: // Lopass
                                    rsample = low;
                                    break;
                                case 3: // Bandpass
                                    rsample = band;
                                    break;
                                case 4: // Notch
                                    rsample = low + high;
                                default:
                            }

                            // Panning
                            t = Math.sin(panFreq * k) * panAmt + 0.5;

                            // Add to 32-bit channel buffer
                            k <<= 1;
                            chnBuf[k] += (rsample * (1 - t)) | 0;
                            chnBuf[k+1] += (rsample * t) | 0;
                        }
                    }
                }
                currentpos += rowLen;
            }
            mCurrentRow++;
        }

        if (mCurrentRow > mLastRow)
        {
            // Delay
            p = ((instr.fx_delay_time * rowLen) >> 1) * 2; // Must be even
            t = instr.fx_delay_amt / 255;
            for (b = 0; b < waveWords - p; b += 2)
            {
                k = b + p;

                // Left channel = left + right[-p] * t
                chnBuf[k] += (chnBuf[b+1] * t) | 0;

                // Right channel = right + left[-p] * t
                chnBuf[k+1] += (chnBuf[b] * t) | 0;
            }

            // Add to mix buffer
            for (b = 0; b < waveWords; b++)
            {
                mixBuf[b] += chnBuf[b];
            }

            mCurrentRow = mFirstRow;
            mCurrentCol++;
        }

        // Next iteration
        return {
          done: mCurrentCol > mLastCol,
          progress: (mCurrentCol - mFirstCol + ((mCurrentRow - mFirstRow) / (mLastRow - mFirstRow + 1))) / (mLastCol - mFirstCol + 1)
        };
    };

    // Create a WAVE formatted sting from the generated audio data
    this.createWave = function()
    {
        // Local variables
        var b, k, x, wave, l1, l2, s, y;

        // Turn critical object properties into local variables (performance)
        var mixBuf = mMixBufWork,
            waveWords = WAVE_SIZE * WAVE_CHAN;

        // We no longer need the channel working buffer
        mChnBufWork = null;

        // Convert to a WAVE file (in a binary string)
        l1 = waveWords * 2 - 8;
        l2 = l1 - 36;
        wave = String.fromCharCode(82,73,70,70,
                                   l1 & 255,(l1 >> 8) & 255,(l1 >> 16) & 255,(l1 >> 24) & 255,
                                   87,65,86,69,102,109,116,32,16,0,0,0,1,0,2,0,
                                   68,172,0,0,16,177,2,0,4,0,16,0,100,97,116,97,
                                   l2 & 255,(l2 >> 8) & 255,(l2 >> 16) & 255,(l2 >> 24) & 255);
        for (b = 0; b < waveWords;)
        {
            // This is a GC & speed trick: don't add one char at a time - batch up
            // larger partial strings
            x = "";
            for (k = 0; k < 256 && b < waveWords; ++k, b++)
            {
                // Note: We clamp here
                y = mixBuf[b];
                y = y < -32767 ? -32767 : (y > 32767 ? 32767 : y);
                x += String.fromCharCode(y & 255, (y >> 8) & 255);
            }
            wave += x;
        }

        // Return the wave formatted string
        return wave;
    };

    // Get n samples of wave data at time t [s]. Wave data in range [-2,2].
    this.getData = function(t, n)
    {
        var i = 2 * Math.floor(t * WAVE_SPS);
        var d = new Array(n);
        var b = mMixBufWork;
        for (var j = 0; j < 2*n; j += 1)
        {
            var k = i + j;
            d[j] = t > 0 && k < b.length ? b[k] / 32768 : 0;
        }
        return d;
    };
};


