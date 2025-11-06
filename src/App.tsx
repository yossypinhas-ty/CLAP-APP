import { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import './App.css';

interface Detection {
  id: string;
  label: string;
  score: number;
  timestamp: Date;
}

type Status = 'idle' | 'loading' | 'listening' | 'error';

function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [detections, setDetections] = useState<Detection[]>([]);
  const [error, setError] = useState<string>('');
  const [model, setModel] = useState<tf.GraphModel | null>(null);
  const [classNames, setClassNames] = useState<string[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [spectrumData, setSpectrumData] = useState<number[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioBufferRef = useRef<Float32Array>(new Float32Array(0));
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const isListeningRef = useRef<boolean>(false);
  const startTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const volumeHistoryRef = useRef<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumSnapshotsRef = useRef<Uint8Array[]>([]);

  // Load YAMNet model on component mount
  useEffect(() => {
    const loadModel = async () => {
      try {
        setStatus('loading');
        setError('');
        await tf.ready();
        
        // Load YAMNet model from TensorFlow Hub
        const MODEL_URL = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1';
        const loadedModel = await tf.loadGraphModel(MODEL_URL, { fromTFHub: true });
        setModel(loadedModel);
        
        // Load class names
        const CLASS_NAMES_URL = 'https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv';
        const response = await fetch(CLASS_NAMES_URL);
        const csvText = await response.text();
        const lines = csvText.split('\n').slice(1); // Skip header
        const names = lines
          .filter(line => line.trim())
          .map(line => {
            const parts = line.split(',');
            return parts[2]?.replace(/"/g, '').trim() || 'Unknown';
          });
        setClassNames(names);
        
        console.log('Model loaded successfully. Class names:', names.length);
        setStatus('idle');
      } catch (err) {
        console.error('Error loading model:', err);
        setError('Failed to load YAMNet model. Please refresh the page.');
        setStatus('error');
      }
    };

    loadModel();

    return () => {
      stopListening();
    };
  }, []);

  // Draw frequency spectrum when data is available
  useEffect(() => {
    console.log('Spectrum useEffect triggered, data length:', spectrumData.length);
    console.log('Canvas ref current:', canvasRef.current);
    
    if (spectrumData.length > 0) {
      // Use a small timeout to ensure canvas is in DOM
      const timer = setTimeout(() => {
        if (!canvasRef.current) {
          console.log('Canvas ref still not available after timeout');
          return;
        }
        
        console.log('Drawing spectrum...');
        const canvas = canvasRef.current;
        console.log('Canvas element:', canvas);
        console.log('Canvas width attr:', canvas.width, 'height attr:', canvas.height);
        const ctx = canvas.getContext('2d');
        console.log('Canvas context:', ctx);
        if (!ctx) {
          console.log('No canvas context');
          return;
        }

        const width = canvas.width;
        const height = canvas.height;
        
        console.log('Canvas dimensions for drawing:', width, 'x', height);
        console.log('Spectrum data to draw:', spectrumData.length, 'values');
        console.log('Sample spectrum values:', spectrumData.slice(0, 10));
        console.log('Max spectrum value:', Math.max(...spectrumData));
      
        // Clear canvas
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        // Define drawing area (leave space at bottom for frequency labels)
        const bottomMargin = 25; // Space for frequency labels
        const drawHeight = height - bottomMargin;
        const leftMargin = 45;
        const drawWidth = width - leftMargin;
        
        // Draw Y-axis labels (dBSPL) on the left - properly scaled
        ctx.fillStyle = '#888B8D';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        
        // dBSPL scale (matching -90 to -10 dB range from analyser settings)
        const dbLabels = [
          { db: -10, y: 0 },
          { db: -30, y: drawHeight * 0.25 },
          { db: -50, y: drawHeight * 0.5 },
          { db: -70, y: drawHeight * 0.75 },
          { db: -90, y: drawHeight }
        ];
        
        dbLabels.forEach(({ db, y }) => {
          ctx.fillText(`${db} dB`, 35, y + 4);
          // Draw horizontal grid line
          ctx.strokeStyle = '#E0E0E0';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(leftMargin, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        });
        
        // Draw frequency bars with logarithmic spacing
        const maxValue = Math.max(...spectrumData, 1); // Avoid division by zero
        
        // Use logarithmic scale for frequency distribution
        // Sample rate is 16kHz, so actual max frequency is 8kHz (Nyquist)
        // But we'll display the range as 100Hz to 10kHz for visualization
        const minFreq = 100; // 100 Hz
        const maxFreq = 10000; // 10 kHz (display range)
        const actualMaxFreq = 8000; // 8 kHz (actual Nyquist limit)
        const logMin = Math.log10(minFreq);
        const logMax = Math.log10(maxFreq);
        
        console.log('Drawing bars, max value:', maxValue, 'data length:', spectrumData.length);
        
        spectrumData.forEach((value, index) => {
          // Calculate actual frequency for this bin (up to 8kHz)
          const actualFreq = (index / spectrumData.length) * actualMaxFreq;
          
          // Skip frequencies below our display range
          if (actualFreq < minFreq) return;
          
          // Map to display range (100Hz to 10kHz) even though data only goes to 8kHz
          const displayFreq = Math.min(actualFreq, maxFreq);
          const logFreq = Math.log10(displayFreq);
          const normalizedPos = (logFreq - logMin) / (logMax - logMin);
          
          // Normalize and amplify the values for better visualization
          const normalizedValue = value / maxValue;
          const barHeight = Math.max(normalizedValue * drawHeight, value > 0 ? 2 : 0); // Minimum 2px if there's any value
          const barWidth = Math.max((drawWidth / spectrumData.length) * 1.5, 2); // Minimum 2px width
          const x = leftMargin + (normalizedPos * drawWidth);
          const y = drawHeight - barHeight;
          
          // Only draw if we have a visible value
          if (barHeight > 0) {
            // Gradient from blue to light blue
            const gradient = ctx.createLinearGradient(0, drawHeight, 0, 0);
            gradient.addColorStop(0, '#1F9AE8');
            gradient.addColorStop(1, '#5CB8F0');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barHeight);
          }
        });
        
        // Draw frequency labels below the chart (logarithmic scale)
        ctx.fillStyle = '#888B8D';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        // Logarithmic frequency labels (100 Hz to 10 kHz)
        const freqLabels = [
          { freq: 100, label: '100 Hz' },
          { freq: 200, label: '200 Hz' },
          { freq: 500, label: '500 Hz' },
          { freq: 1000, label: '1 kHz' },
          { freq: 2000, label: '2 kHz' },
          { freq: 5000, label: '5 kHz' },
          { freq: 10000, label: '10 kHz' }
        ];
        
        freqLabels.forEach(({ freq, label }) => {
          const logFreq = Math.log10(freq);
          const normalizedPos = (logFreq - logMin) / (logMax - logMin);
          const x = leftMargin + (normalizedPos * drawWidth);
          ctx.fillText(label, x, drawHeight + 15);
        });
        
        console.log('Spectrum drawn successfully');
      }, 100); // 100ms delay
      
      return () => clearTimeout(timer);
    }
  }, [spectrumData]);

  const startListening = async () => {
    if (!model || !classNames.length) {
      setError('Model not loaded yet');
      return;
    }

    try {
      setStatus('loading');
      setError('');
      setSpectrumData([]); // Clear previous spectrum data
      spectrumSnapshotsRef.current = []; // Clear spectrum snapshots

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        } 
      });
      streamRef.current = stream;

      // Create audio context with 16kHz sample rate (required by YAMNet)
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      
      // Create analyser for frequency spectrum
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8; // Smooth out the frequency data
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyserRef.current = analyser;
      
      // Use ScriptProcessorNode to capture audio data
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const currentBuffer = audioBufferRef.current;
        
        // Check if we're actually getting audio data
        const hasSound = Array.from(inputData).some(sample => Math.abs(sample) > 0.01);
        if (hasSound) {
          console.log('Audio detected, buffer size:', currentBuffer.length);
          
          // Capture spectrum snapshot periodically (every 10th time we have sound)
          if (analyserRef.current && spectrumSnapshotsRef.current.length < 50 && Math.random() < 0.1) {
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyserRef.current.getByteFrequencyData(dataArray);
            spectrumSnapshotsRef.current.push(dataArray);
          }
        }
        
        // Append new audio data to buffer
        const newBuffer = new Float32Array(currentBuffer.length + inputData.length);
        newBuffer.set(currentBuffer);
        newBuffer.set(inputData, currentBuffer.length);
        audioBufferRef.current = newBuffer;
        
        // If we have enough data (at least 0.975 seconds = 15600 samples at 16kHz)
        if (audioBufferRef.current.length >= 15600) {
          console.log('Processing audio chunk of size:', audioBufferRef.current.length);
          processAudioChunk();
        }
      };

      source.connect(analyser);
      source.connect(processor);
      processor.connect(audioContext.destination);

      setStatus('listening');
      isListeningRef.current = true;
      
      // Start timer
      startTimeRef.current = Date.now();
      setRecordingTime(0);
      timerIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setRecordingTime(elapsed);
        }
      }, 1000);
      
      console.log('Audio capture started successfully');
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Failed to access microphone. Please check permissions.');
      setStatus('error');
    }
  };

    const processAudioChunk = async () => {
    if (!model || !classNames.length || !isListeningRef.current) {
      console.log('Skipping processing:', { model: !!model, classNames: classNames.length, isListening: isListeningRef.current });
      return;
    }

    try {
      // Get the audio buffer
      const audioData = audioBufferRef.current.slice(0, 15600);
      
      // Calculate RMS volume for this chunk
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        sum += audioData[i] * audioData[i];
      }
      const rms = Math.sqrt(sum / audioData.length);
      
      // Store volume level
      volumeHistoryRef.current.push(rms);
      
      // Clear the buffer (keep any extra data for next chunk)
      audioBufferRef.current = audioBufferRef.current.slice(15600);
      
      console.log('Running inference on audio chunk...');
      
      // Convert to tensor and run inference
      const waveform = tf.tensor1d(Array.from(audioData));
      const result = model.execute(waveform);
      
      console.log('Model result type:', result);
      
      // YAMNet returns multiple outputs, we need the scores (first output)
      let scores: tf.Tensor;
      if (Array.isArray(result)) {
        scores = result[0] as tf.Tensor;
        // Dispose other outputs
        result.slice(1).forEach(t => (t as tf.Tensor).dispose());
      } else {
        scores = result as tf.Tensor;
      }
      
      const scoresData = await scores.data();
      
      console.log('Inference complete, scores array length:', scoresData.length);
      
      // Clean up tensors
      waveform.dispose();
      scores.dispose();
      
      // Get predictions with scores
      const predictions = Array.from(scoresData)
        .map((score, index) => ({
          name: classNames[index] || `Class ${index}`,
          score: score as number,
        }))
        .sort((a, b) => b.score - a.score);

      console.log('Top 10 predictions:', predictions.slice(0, 10));

      // Filter predictions with confidence > 0.2 and get top 5
      const topPredictions = predictions
        .filter(p => p.score > 0.2)
        .slice(0, 5)
        .map(p => ({
          id: `${Date.now()}-${Math.random()}`,
          label: p.name,
          score: p.score,
          timestamp: new Date(),
        }));

      if (topPredictions.length > 0) {
        console.log('Detected sounds:', topPredictions);
        setDetections((prev: Detection[]) => {
          // Keep only the last 20 detections
          const updated = [...topPredictions, ...prev].slice(0, 20);
          return updated;
        });
      } else {
        console.log('No sounds above 20% confidence threshold');
      }
    } catch (err) {
      console.error('Error during detection:', err);
    }
  };

  const generateAISummary = async (data: {
    duration: number;
    totalDetections: number;
    uniqueSounds: number;
    topSounds: Array<{ sound: string; count: number; avgConfidence: string }>;
    categories: string[];
    noiseMetrics?: { avgVolume: number; peakVolume: number; silencePercent: number };
  }): Promise<string> => {
    console.log('Generating AI-enhanced narrative summary...');
    
    const topSound = data.topSounds[0];
    const duration = data.duration;
    const totalDetections = data.totalDetections;
    
    // Categorize sounds with detailed analysis
    const hasMusic = data.categories.includes('music');
    const hasSpeech = data.categories.includes('speech');
    const hasAnimals = data.categories.includes('animals');
    const hasNature = data.categories.includes('nature');
    const hasMechanical = data.categories.includes('mechanical');
    const hasDomestic = data.categories.includes('domestic');
    
    // Analyze acoustic density
    const detectionRate = totalDetections / duration; // sounds per second
    
    // Determine acoustic environment from noise metrics
    let acousticEnvironment = '';
    if (data.noiseMetrics) {
      const { avgVolume, silencePercent } = data.noiseMetrics;
      if (avgVolume > 0.15) {
        acousticEnvironment = 'a remarkably loud environment with intense acoustic energy';
      } else if (avgVolume > 0.1) {
        acousticEnvironment = 'a notably loud space with substantial ambient noise';
      } else if (avgVolume > 0.05) {
        acousticEnvironment = 'a moderately active acoustic space';
      } else if (silencePercent > 50) {
        acousticEnvironment = 'a quiet environment with significant periods of silence';
      } else {
        acousticEnvironment = 'a calm acoustic setting';
      }
    }
    
    // Build rich narrative description
    let narrative = '';
    
    // Opening: Set the scene with vivid language including acoustic environment
    if (hasSpeech && topSound.count >= 5) {
      const intensity = topSound.count > 10 ? 'animated conversation' : 'ongoing dialogue';
      narrative += `The recording captures ${intensity} in ${acousticEnvironment}, with human voices weaving through the ${duration}-second soundscape. `;
      
      if (hasDomestic) {
        narrative += `The setting appears to be indoors—a home or office—where everyday sounds like ${data.topSounds.find(s => ['Door', 'Slam', 'Cupboard'].some(d => s.sound.includes(d)))?.sound.toLowerCase() || 'domestic activity'} punctuate the vocal exchange. `;
      }
    } else if (hasMusic) {
      narrative += `Musical tones fill this ${duration}-second clip${acousticEnvironment ? ` in ${acousticEnvironment}` : ''}, creating a melodic atmosphere that dominates the acoustic space. `;
    } else if (hasAnimals && hasNature) {
      narrative += `This ${duration}-second recording transports us to a natural setting${acousticEnvironment ? ` characterized by ${acousticEnvironment}` : ''} alive with wildlife. `;
      const animalSounds = data.topSounds.filter(s => hasAnimals && ['Bird', 'Crow', 'Animal', 'Dog', 'Cat'].some(a => s.sound.includes(a)));
      if (animalSounds.length > 0) {
        narrative += `${animalSounds[0].sound} calls ring out ${animalSounds[0].count} times, painting an auditory picture of the outdoors. `;
      }
    } else if (hasMechanical) {
      narrative += `The mechanical hum of modern life permeates this ${duration}-second segment${acousticEnvironment ? ` in ${acousticEnvironment}` : ''}, suggesting an urban or industrial environment. `;
    } else {
      narrative += `Over ${duration} seconds${acousticEnvironment ? ` in ${acousticEnvironment}` : ''}, a tapestry of sounds unfolds, revealing the character of this acoustic moment. `;
    }
    
    // Middle: Add texture and detail
    if (detectionRate > 2) {
      narrative += `The soundscape is remarkably dense—averaging ${detectionRate.toFixed(1)} distinct sounds per second—creating a rich, layered audio texture. `;
    } else if (detectionRate < 0.5) {
      narrative += `Sparse and measured, the acoustic events arrive with intentional spacing, allowing each sound to resonate before the next emerges. `;
    }
    
    // Describe secondary and tertiary sounds with narrative flow
    if (data.topSounds.length >= 3) {
      const secondary = data.topSounds.slice(1, 3);
      const soundDescriptions = secondary.map(s => {
        if (s.count > 3) return `frequent ${s.sound.toLowerCase()} (${s.count} instances)`;
        else return `occasional ${s.sound.toLowerCase()}`;
      });
      
      narrative += `Beneath the primary layer, ${soundDescriptions.join(' and ')} add complexity to the composition. `;
    }
    
    // Closing: Contextual interpretation with insight
    if (hasSpeech && hasDomestic && !hasMechanical) {
      narrative += `The interplay of conversation and household sounds suggests a lived-in space—perhaps a kitchen or living room—where human activity and domestic routines intersect naturally.`;
    } else if (hasSpeech && hasAnimals) {
      narrative += `The juxtaposition of human voices and animal sounds paints a picture of coexistence—a backyard, a park, or a rural homestead where the boundaries between human and natural worlds blur.`;
    } else if (hasMusic && hasSpeech) {
      narrative += `This appears to be a social setting—a gathering where music provides ambiance for conversation, creating the acoustic signature of communal enjoyment.`;
    } else if (hasAnimals && hasNature && !hasSpeech) {
      narrative += `Untouched by human presence, this soundscape offers a window into the natural world, where animal calls and environmental sounds compose their own organic symphony.`;
    } else if (hasMechanical) {
      narrative += `The predominance of mechanical sounds speaks to our modern built environment, where human-engineered systems create their own distinct acoustic language.`;
    } else {
      const categoryList = data.categories.join(', ');
      narrative += `Drawing from ${data.categories.length} sonic categories (${categoryList}), this recording presents a unique acoustic fingerprint—a moment captured in sound that tells its own story.`;
    }
    
    return narrative;
  };

  const generateSummary = async (noiseMetrics: number[] | null = null) => {
    if (detections.length === 0) {
      setSummary('No sounds were detected during this listening session.');
      return;
    }

    setIsGeneratingSummary(true);

    try {
      // Count occurrences of each sound
      const soundCounts = new Map<string, number>();
      const soundScores = new Map<string, number[]>();
      
      detections.forEach(detection => {
        const count = soundCounts.get(detection.label) || 0;
        soundCounts.set(detection.label, count + 1);
        
        const scores = soundScores.get(detection.label) || [];
        scores.push(detection.score);
        soundScores.set(detection.label, scores);
      });

      // Sort by frequency
      const sortedSounds = Array.from(soundCounts.entries())
        .sort((a, b) => b[1] - a[1]);

      // Use the actual recording time from the timer
      const sessionDuration = recordingTime;

      // Categorize sounds
      const categories = {
        speech: ['Speech', 'Conversation', 'Narration', 'Monologue', 'Whispering', 'Singing', 'Yell', 'Shout'],
        music: ['Music', 'Musical instrument', 'Plucked string instrument', 'Guitar', 'Piano', 'Drum', 'Bass'],
        animals: ['Animal', 'Dog', 'Cat', 'Bird', 'Insect', 'Roar', 'Bark', 'Meow'],
        mechanical: ['Vehicle', 'Engine', 'Motor', 'Machine', 'Tools', 'Mechanical fan'],
        nature: ['Water', 'Wind', 'Rain', 'Thunder', 'Stream', 'Ocean'],
        domestic: ['Door', 'Drawer', 'Cupboard', 'Dishes', 'Cutlery', 'Telephone']
      };

      const detectedCategories = new Set<string>();
      sortedSounds.forEach(([sound]) => {
        for (const [category, keywords] of Object.entries(categories)) {
          if (keywords.some(keyword => sound.toLowerCase().includes(keyword.toLowerCase()))) {
            detectedCategories.add(category);
          }
        }
      });

      // Generate AI-powered contextual summary
      const topSounds = sortedSounds.slice(0, 10).map(([sound, count]) => ({
        sound,
        count,
        avgConfidence: ((soundScores.get(sound)?.reduce((a, b) => a + b, 0) || 0) / (soundScores.get(sound)?.length || 1) * 100).toFixed(1)
      }));

      const aiSummary = await generateAISummary({
        duration: sessionDuration,
        totalDetections: detections.length,
        uniqueSounds: soundCounts.size,
        topSounds,
        categories: Array.from(detectedCategories),
        noiseMetrics: noiseMetrics && noiseMetrics.length === 5 ? {
          avgVolume: noiseMetrics[0],
          peakVolume: noiseMetrics[1],
          silencePercent: noiseMetrics[3]
        } : undefined
      });

      // Build complete summary
      let summaryText = `📊 Listening Session Summary\n\n`;
      summaryText += `🔷 CLAP AI Summary\n`;
      summaryText += `${aiSummary}\n\n`;
      summaryText += `⏱️ Duration: ~${sessionDuration} seconds\n`;
      summaryText += `🔊 Total Detections: ${detections.length}\n`;
      summaryText += `🎵 Unique Sounds: ${soundCounts.size}\n\n`;
      
      // Add noise level metrics
      if (noiseMetrics && noiseMetrics.length === 5) {
        const [avgVolume, peakVolume, volumeRange, silencePercent, noiseFloor] = noiseMetrics;
        summaryText += `📊 Noise Level Analysis:\n`;
        summaryText += `• Average Volume: ${(avgVolume * 100).toFixed(2)}%\n`;
        summaryText += `• Peak Volume: ${(peakVolume * 100).toFixed(2)}%\n`;
        summaryText += `• Volume Range: ${(volumeRange * 100).toFixed(2)}%\n`;
        summaryText += `• Silence: ${silencePercent.toFixed(1)}%\n`;
        summaryText += `• Noise Floor: ${(noiseFloor * 100).toFixed(2)}%\n`;
        
        // Determine environment noise level
        let noiseLevel = 'Quiet';
        if (avgVolume > 0.15) noiseLevel = 'Very Loud';
        else if (avgVolume > 0.1) noiseLevel = 'Loud';
        else if (avgVolume > 0.05) noiseLevel = 'Moderate';
        
        summaryText += `• Environment: ${noiseLevel}\n\n`;
      }
      
      summaryText += `Most Frequent Sounds:\n`;
      sortedSounds.slice(0, 10).forEach(([sound, count], index) => {
        const scores = soundScores.get(sound) || [];
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        summaryText += `${index + 1}. ${sound} - detected ${count} time${count > 1 ? 's' : ''} (avg confidence: ${(avgScore * 100).toFixed(1)}%)\n`;
      });

      if (detectedCategories.size > 0) {
        summaryText += `\nSound Categories Detected:\n`;
        Array.from(detectedCategories).forEach(category => {
          summaryText += `• ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;
        });
      }

      setSummary(summaryText);
    } catch (error) {
      console.error('Error generating summary:', error);
      // Fallback to basic summary if AI fails
      generateBasicSummary();
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const generateBasicSummary = () => {
    if (detections.length === 0) {
      setSummary('No sounds were detected during this listening session.');
      return;
    }

    // Count occurrences of each sound
    const soundCounts = new Map<string, number>();
    const soundScores = new Map<string, number[]>();
    
    detections.forEach(detection => {
      const count = soundCounts.get(detection.label) || 0;
      soundCounts.set(detection.label, count + 1);
      
      const scores = soundScores.get(detection.label) || [];
      scores.push(detection.score);
      soundScores.set(detection.label, scores);
    });

    // Sort by frequency
    const sortedSounds = Array.from(soundCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    // Use the actual recording time from the timer
    const sessionDuration = recordingTime;

    // Categorize sounds
    const categories = {
      speech: ['Speech', 'Conversation', 'Narration', 'Monologue', 'Whispering', 'Singing', 'Yell', 'Shout'],
      music: ['Music', 'Musical instrument', 'Plucked string instrument', 'Guitar', 'Piano', 'Drum', 'Bass'],
      animals: ['Animal', 'Dog', 'Cat', 'Bird', 'Insect', 'Roar', 'Bark', 'Meow'],
      mechanical: ['Vehicle', 'Engine', 'Motor', 'Machine', 'Tools', 'Mechanical fan'],
      nature: ['Water', 'Wind', 'Rain', 'Thunder', 'Stream', 'Ocean'],
      domestic: ['Door', 'Drawer', 'Cupboard', 'Dishes', 'Cutlery', 'Telephone']
    };

    const detectedCategories = new Set<string>();
    sortedSounds.forEach(([sound]) => {
      for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(keyword => sound.toLowerCase().includes(keyword.toLowerCase()))) {
          detectedCategories.add(category);
        }
      }
    });

    // Build summary
    let summaryText = `📊 Listening Session Summary\n\n`;
    
    // Descriptive narrative first
    summaryText += `Session Description:\n`;
    if (sortedSounds.length > 0) {
      const topSound = sortedSounds[0][0];
      const topCount = sortedSounds[0][1];
      summaryText += `During this ${sessionDuration}-second listening session, the audio environment was predominantly characterized by ${topSound.toLowerCase()}, which appeared ${topCount} times. `;
      
      if (sortedSounds.length > 1) {
        const secondSound = sortedSounds[1][0];
        summaryText += `Other notable sounds included ${secondSound.toLowerCase()}`;
        
        if (sortedSounds.length > 2) {
          const thirdSound = sortedSounds[2][0];
          summaryText += ` and ${thirdSound.toLowerCase()}`;
        }
        summaryText += `. `;
      }
      
      if (detectedCategories.size > 0) {
        summaryText += `The acoustic scene included elements from ${detectedCategories.size} different category${detectedCategories.size > 1 ? 'ies' : ''}: ${Array.from(detectedCategories).join(', ')}.`;
      }
    }
    
    summaryText += `\n\n⏱️ Duration: ~${sessionDuration} seconds\n`;
    summaryText += `🔊 Total Detections: ${detections.length}\n`;
    summaryText += `🎵 Unique Sounds: ${soundCounts.size}\n\n`;
    
    summaryText += `Most Frequent Sounds:\n`;
    sortedSounds.slice(0, 10).forEach(([sound, count], index) => {
      const scores = soundScores.get(sound) || [];
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      summaryText += `${index + 1}. ${sound} - detected ${count} time${count > 1 ? 's' : ''} (avg confidence: ${(avgScore * 100).toFixed(1)}%)\n`;
    });

    if (detectedCategories.size > 0) {
      summaryText += `\nSound Categories Detected:\n`;
      Array.from(detectedCategories).forEach(category => {
        summaryText += `• ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;
      });
    }

    setSummary(summaryText);
  };

  const stopListening = () => {
    // Stop listening flag
    isListeningRef.current = false;
    
    // Process captured spectrum snapshots
    if (spectrumSnapshotsRef.current.length > 0) {
      console.log('Processing', spectrumSnapshotsRef.current.length, 'spectrum snapshots');
      
      // Average all captured snapshots for a smooth representation
      const bufferLength = spectrumSnapshotsRef.current[0].length;
      const averaged = new Float32Array(bufferLength);
      
      spectrumSnapshotsRef.current.forEach(snapshot => {
        for (let i = 0; i < bufferLength; i++) {
          averaged[i] += snapshot[i];
        }
      });
      
      for (let i = 0; i < bufferLength; i++) {
        averaged[i] /= spectrumSnapshotsRef.current.length;
      }
      
      // Use first 128 bins for display
      const displayData = Array.from(averaged.slice(0, 128));
      console.log('Averaged spectrum data:', displayData.length, 'bins');
      console.log('Sample values:', displayData.slice(0, 10));
      console.log('Max value:', Math.max(...displayData));
      console.log('Non-zero values:', displayData.filter(v => v > 0).length);
      setSpectrumData(displayData);
      
      // Clear snapshots for next recording
      spectrumSnapshotsRef.current = [];
    } else {
      console.log('No spectrum snapshots captured');
    }
    
    // Stop timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    startTimeRef.current = null;
    
    // Calculate noise metrics from volume history
    let calculatedMetrics: number[] | null = null;
    const volumes = volumeHistoryRef.current;
    if (volumes.length > 0) {
      const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const peakVolume = Math.max(...volumes);
      const minVolume = Math.min(...volumes);
      const volumeRange = peakVolume - minVolume;
      
      // Detect silence (volume below threshold)
      const silenceThreshold = 0.01;
      const silentSamples = volumes.filter(v => v < silenceThreshold).length;
      const silencePercent = (silentSamples / volumes.length) * 100;
      
      // Calculate noise floor (average of lowest 10% of samples)
      const sortedVolumes = [...volumes].sort((a, b) => a - b);
      const noiseFloorSamples = sortedVolumes.slice(0, Math.ceil(sortedVolumes.length * 0.1));
      const noiseFloor = noiseFloorSamples.reduce((a, b) => a + b, 0) / noiseFloorSamples.length;
      
      calculatedMetrics = [avgVolume, peakVolume, volumeRange, silencePercent, noiseFloor];
    }
    
    // Generate summary with calculated metrics
    generateSummary(calculatedMetrics);
    
    // Clear volume history
    volumeHistoryRef.current = [];
    
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Disconnect script processor
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Clear audio buffer
    audioBufferRef.current = new Float32Array(0);
    
    analyserRef.current = null;
    setRecordingTime(0);
    setStatus('idle');
    console.log('Audio capture stopped');
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'loading':
        return '⏳ Loading model...';
      case 'listening':
        return '🎤 Listening...';
      case 'error':
        return `❌ ${error}`;
      default:
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.7586 0.24L6.6586 0.29C6.5011 0.319287 6.34923 0.373287 6.2086 0.45C5.77984 0.290624 5.32601 0.20934 4.8686 0.21H4.5286C3.40777 0.312014 2.35255 0.783345 1.5286 1.55C0.743954 2.29917 0.227743 3.2858 0.0596596 4.35755C-0.108424 5.42931 0.0809684 6.5266 0.598596 7.48C0.968726 8.11149 1.26724 8.78231 1.4886 9.48V9.55H1.4286C1.01262 9.88441 0.729075 10.3558 0.628596 10.88C0.569392 11.1685 0.568988 11.466 0.627408 11.7546C0.685827 12.0433 0.80187 12.3172 0.968596 12.56C1.13266 12.8044 1.34327 13.014 1.5884 13.1769C1.83352 13.3398 2.10835 13.4529 2.39718 13.5095C2.68601 13.5662 2.98317 13.5653 3.27167 13.5071C3.56018 13.4488 3.83438 13.3343 4.0786 13.17C4.32296 13.0059 4.53259 12.7953 4.69552 12.5502C4.85844 12.3051 4.97146 12.0302 5.02811 11.7414C5.08476 11.4526 5.08393 11.1554 5.02568 10.8669C4.96742 10.5784 4.85288 10.3042 4.6886 10.06C4.48533 9.75261 4.20905 9.50038 3.88447 9.32587C3.55989 9.15137 3.19712 9.06002 2.8286 9.06H2.6086V8.98C2.3562 8.23662 2.03828 7.51713 1.6586 6.83C1.28762 6.13141 1.14964 5.33254 1.26477 4.54998C1.37991 3.76742 1.74214 3.04214 2.2986 2.48C2.9335 1.89526 3.74773 1.54278 4.6086 1.48H4.8486C4.98167 1.46828 5.11552 1.46828 5.2486 1.48H5.3586V1.59C5.32663 1.71758 5.30985 1.84848 5.3086 1.98V2.04C5.19749 2.2919 5.17057 2.5729 5.23182 2.84131C5.29306 3.10972 5.43922 3.35123 5.6486 3.53C6.00733 3.85764 6.29935 4.25153 6.5086 4.69C6.89978 5.69168 7.06703 6.76683 6.9986 7.84C6.99051 8.25609 7.0274 8.67183 7.1086 9.08C7.19827 9.46892 7.31865 9.85011 7.4686 10.22C8.12506 12.0226 9.42516 13.5186 11.1186 14.42C11.2654 14.4904 11.4258 14.5279 11.5886 14.53C12.0193 14.4822 12.4264 14.3083 12.7586 14.03L12.8486 13.98C13.2386 13.71 13.6886 13.1 14.0486 10.61C14.1271 9.60012 14.0255 8.58433 13.7486 7.61L13.6886 7.32C13.5686 6.76 13.4186 6.18 13.1886 5.44C13.1886 5.28 13.0986 5.13 13.0486 4.97C12.8598 4.33543 12.5657 3.7371 12.1786 3.2C11.4438 2.26586 10.5334 1.48451 9.4986 0.9L8.6986 0.48L8.2186 0.2C7.96872 0.0784856 7.69626 0.0103713 7.4186 0C7.18297 0.0134761 6.95518 0.0894073 6.7586 0.22" fill="#888B8D"/>
            </svg>
            Ready to start
          </span>
        );
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo-wrapper">
          <div className="logo">
            <img src="/starkey-logo.png" alt="Starkey" />
          </div>
          <p className="logo-subtitle">Advanced Technology & Features - Research Tool</p>
        </div>
        <div className="header-content">
          <h1>CLAP vs. YAMNet Audio Detector</h1>
          <p>AI-powered real-time sound detection and analysis</p>
        </div>
      </header>

      <div className={`status ${status}`}>
        {getStatusMessage()}
      </div>

      <div className="controls">
        <button
          className="start-button"
          onClick={startListening}
          disabled={status === 'loading' || status === 'listening' || !model}
        >
          Start Listening
        </button>
        <button
          className="stop-button"
          onClick={stopListening}
          disabled={status !== 'listening'}
        >
          Stop
        </button>
        {status === 'listening' && (
          <div className="recording-timer">
            ⏱️ {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
          </div>
        )}
      </div>

      {status === 'listening' && volumeHistoryRef.current.length > 0 && (
        <div className="noise-level-indicator">
          <div className="noise-label">Noise Level:</div>
          <div className="noise-meter">
            <div 
              className="noise-meter-fill" 
              style={{ 
                width: `${Math.min(volumeHistoryRef.current[volumeHistoryRef.current.length - 1] * 500, 100)}%` 
              }}
            />
          </div>
          <div className="noise-level-text">
            {(() => {
              const currentVolume = volumeHistoryRef.current[volumeHistoryRef.current.length - 1] || 0;
              if (currentVolume > 0.15) return '🔴 Very Loud';
              if (currentVolume > 0.1) return '🟠 Loud';
              if (currentVolume > 0.05) return '🟡 Moderate';
              return '🟢 Quiet';
            })()}
          </div>
        </div>
      )}

      <div className="content-grid">
        <div className="detections-container">
          <h2>Detected Sounds</h2>
          <div className="detections-list">
            {detections.length === 0 ? (
              <div className="empty-state">
                No sounds detected yet. Click "Start Listening" to begin.
              </div>
            ) : (
              detections.map(detection => (
                <div key={detection.id} className="detection-item">
                  <span className="detection-label">{detection.label}</span>
                  <div className="confidence-bar">
                    <div 
                      className="confidence-fill" 
                      style={{ width: `${detection.score * 100}%` }}
                    />
                  </div>
                  <span className="detection-score">
                    {(detection.score * 100).toFixed(1)}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="summary-container">
          <h2>Session Summary</h2>
          <div className="summary-content">
            {isGeneratingSummary ? (
              <div className="empty-state">
                <div className="loading-spinner">🤖</div>
                Generating AI-powered summary...
              </div>
            ) : summary ? (
              <>
                {spectrumData.length > 0 && (
                  <div className="spectrum-container">
                    <h3 className="spectrum-title">📊 Frequency Spectrum</h3>
                    <canvas 
                      ref={canvasRef}
                      width={600}
                      height={230}
                      className="spectrum-canvas"
                    />
                  </div>
                )}
                <pre className="summary-text">{summary}</pre>
              </>
            ) : (
              <div className="empty-state">
                Summary will appear here after you stop listening.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="info-box">
        <h3>ℹ️ About YAMNet</h3>
        <ul>
          <li>YAMNet can detect 521 different audio event classes</li>
          <li>Including: speech, music, animals, vehicles, and environmental sounds</li>
          <li>The model runs entirely in your browser using TensorFlow.js</li>
          <li>Only sounds with confidence above 20% are displayed</li>
          <li>Processing happens at 16kHz sample rate</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
