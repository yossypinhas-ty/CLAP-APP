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
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioBufferRef = useRef<Float32Array>(new Float32Array(0));
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const isListeningRef = useRef<boolean>(false);
  const startTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  const startListening = async () => {
    if (!model || !classNames.length) {
      setError('Model not loaded yet');
      return;
    }

    try {
      setStatus('loading');
      setError('');

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

  const generateSummary = () => {
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
    
    // Stop timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    startTimeRef.current = null;
    
    // Generate summary before clearing data
    generateSummary();
    
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
        return '🔇 Ready to start';
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🎵 YAMNet Audio Detector</h1>
        <p>Real-time audio event detection in your browser</p>
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
            {summary ? (
              <pre className="summary-text">{summary}</pre>
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
