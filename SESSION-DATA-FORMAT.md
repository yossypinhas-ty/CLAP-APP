# Session Data Format

## Overview
The Save Session feature exports acoustic testing data as JSON files for analysis and documentation.

## File Naming
```
acoustic-session-YYYY-MM-DDTHH-MM-SS.json
```
Example: `acoustic-session-2025-11-09T11-45-30.json`

## JSON Structure

```json
{
  "metadata": {
    "timestamp": "2025-11-09T11:45:30.123Z",
    "date": "11/9/2025",
    "time": "11:45:30 AM",
    "duration": 45,
    "totalDetections": 127,
    "uniqueSounds": 8,
    "userNotes": "Cafeteria during lunch hour - high ambient noise"
  },
  "acousticEnvironment": {
    "averageVolume": "45.23%",
    "peakVolume": "78.90%",
    "volumeRange": "65.45%",
    "silencePercentage": "12.50%",
    "noiseFloor": "15.30%"
  },
  "frequentSounds": [
    {
      "sound": "Speech",
      "detectionCount": 45,
      "avgConfidence": "75.4%",
      "avgVolume": "52.1%",
      "avgFrequency": "850 Hz"
    },
    {
      "sound": "Dishes, pots, and pans",
      "detectionCount": 23,
      "avgConfidence": "68.2%",
      "avgVolume": "45.8%",
      "avgFrequency": "3200 Hz"
    }
  ],
  "allDetections": [
    {
      "sound": "Speech",
      "confidence": "82.5%",
      "volume": "48.3%",
      "frequency": "820 Hz",
      "timestamp": "2025-11-09T11:45:32.456Z"
    }
  ],
  "summary": "Full text summary of the session...",
  "frequencySpectrum": {
    "available": true,
    "description": "Averaged frequency spectrum from 100Hz to 10kHz (128 bins)",
    "frequencyRange": "100 Hz - 10000 Hz",
    "resolution": "128 bins",
    "scale": "logarithmic",
    "unit": "dBSPL",
    "data": [
      {
        "bin": 0,
        "frequency": "100 Hz",
        "magnitude": "-65.32"
      },
      {
        "bin": 1,
        "frequency": "108 Hz",
        "magnitude": "-62.45"
      },
      {
        "bin": 64,
        "frequency": "1000 Hz",
        "magnitude": "-45.20"
      },
      {
        "bin": 127,
        "frequency": "10000 Hz",
        "magnitude": "-78.50"
      }
    ]
  }
}
```

## Data Fields

### Metadata
- **timestamp**: ISO 8601 format timestamp
- **date/time**: User-friendly formatted date and time
- **duration**: Recording duration in seconds
- **totalDetections**: Total number of sound detections
- **uniqueSounds**: Number of unique sound types detected
- **userNotes**: Free-text notes entered by user

### Acoustic Environment
- **averageVolume**: Mean microphone input level (%)
- **peakVolume**: Maximum volume level recorded (%)
- **volumeRange**: Difference between peak and minimum (%)
- **silencePercentage**: Percentage of silent frames (%)
- **noiseFloor**: Baseline noise level (10th percentile)

### Frequent Sounds
Top sounds detected, sorted by frequency:
- **sound**: Sound classification name
- **detectionCount**: Number of times detected
- **avgConfidence**: Average AI confidence (%)
- **avgVolume**: Average volume when detected (%)
- **avgFrequency**: Average dominant frequency (Hz)

### All Detections
Complete chronological list of every detection:
- **sound**: Sound classification name
- **confidence**: AI confidence for this detection (%)
- **volume**: Volume level at detection (%)
- **frequency**: Dominant frequency at detection (Hz)
- **timestamp**: Exact time of detection (ISO 8601)

### Frequency Spectrum
Averaged frequency spectrum data (only if session was recorded):
- **available**: Boolean indicating if spectrum data is present
- **description**: Description of the spectrum data
- **frequencyRange**: Frequency range covered (100 Hz - 10000 Hz)
- **resolution**: Number of frequency bins (128)
- **scale**: Scale type (logarithmic)
- **unit**: Measurement unit (dBSPL)
- **data**: Array of 128 data points, each containing:
  - **bin**: Bin index (0-127)
  - **frequency**: Frequency in Hz (logarithmic spacing)
  - **magnitude**: Magnitude in dBSPL

The spectrum data represents the averaged frequency content across the entire recording session, useful for:
- Identifying dominant frequency ranges
- Characterizing acoustic signature of environment
- Comparing spectral profiles between locations
- Detecting resonances or frequency-specific issues

## Use Cases

### 1. Testing Different Environments
```
Environment 1: Office - quiet workspace
Environment 2: Cafeteria - high ambient noise
Environment 3: Street - traffic sounds
```

### 2. Comparing Acoustic Profiles
- Load multiple JSON files
- Compare avgVolume, uniqueSounds, silencePercentage
- Identify characteristic sounds per environment

### 3. Time-Series Analysis
- Track how sounds change over time using timestamps
- Identify patterns (e.g., speech increases during lunch)

### 4. Research Documentation
- Attach JSON files to research reports
- Reproducible acoustic environment characterization
- Objective measurements vs subjective descriptions

## Tips for Effective Testing

1. **Use Descriptive Notes**
   - Location: "Building A, 2nd floor, Room 205"
   - Time context: "Morning coffee break, 10:15 AM"
   - Special conditions: "HVAC off, windows open"
   - Notable events: "Fire drill at 10:20 AM"

2. **Recording Duration**
   - Minimum 30 seconds for statistical relevance
   - 1-2 minutes for typical environments
   - Longer for variable environments

3. **Multiple Samples**
   - Record same environment at different times
   - Compare weekday vs weekend
   - Different weather conditions (windows open/closed)

4. **Organize Your Data**
   ```
   data/
   ├── office/
   │   ├── acoustic-session-2025-11-09T09-00-00.json
   │   └── acoustic-session-2025-11-09T15-00-00.json
   ├── cafeteria/
   │   └── acoustic-session-2025-11-09T12-00-00.json
   └── outdoor/
       └── acoustic-session-2025-11-09T14-00-00.json
   ```

## Data Analysis Tools

You can analyze the JSON files using:
- **Python**: `pandas`, `json`, `matplotlib`
- **Excel**: Import JSON (Power Query)
- **R**: `jsonlite`, `tidyverse`
- **JavaScript**: Direct JSON parsing in browser/Node.js

### Example Python Analysis
```python
import json
import pandas as pd
import matplotlib.pyplot as plt

# Load session
with open('acoustic-session-2025-11-09T11-45-30.json', 'r') as f:
    session = json.load(f)

# Convert to DataFrame
detections_df = pd.DataFrame(session['allDetections'])
frequent_df = pd.DataFrame(session['frequentSounds'])

# Basic analysis
print(f"Total duration: {session['metadata']['duration']}s")
print(f"Average volume: {session['acousticEnvironment']['averageVolume']}")
print(f"Top 3 sounds: {frequent_df['sound'].head(3).tolist()}")

# Plot frequency spectrum
if session['frequencySpectrum']['available']:
    spectrum_df = pd.DataFrame(session['frequencySpectrum']['data'])
    
    # Extract numeric values
    spectrum_df['freq_hz'] = spectrum_df['frequency'].str.extract('(\d+)').astype(int)
    spectrum_df['magnitude_db'] = spectrum_df['magnitude'].astype(float)
    
    # Plot
    plt.figure(figsize=(12, 6))
    plt.plot(spectrum_df['freq_hz'], spectrum_df['magnitude_db'], linewidth=2)
    plt.xscale('log')
    plt.xlabel('Frequency (Hz)')
    plt.ylabel('Magnitude (dBSPL)')
    plt.title(f"Frequency Spectrum - {session['metadata']['userNotes']}")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('spectrum_plot.png', dpi=150)
    plt.show()

# Compare multiple sessions
import glob

sessions = []
for file in glob.glob('data/*/*.json'):
    with open(file, 'r') as f:
        sessions.append(json.load(f))

# Extract average volumes
comparison = pd.DataFrame([{
    'location': s['metadata']['userNotes'],
    'avg_volume': float(s['acousticEnvironment']['averageVolume'].rstrip('%')),
    'peak_volume': float(s['acousticEnvironment']['peakVolume'].rstrip('%')),
    'unique_sounds': s['metadata']['uniqueSounds']
} for s in sessions])

print(comparison)
```

### Example Spectrum Analysis in Excel
1. Open Excel → Data → Get Data → From File → From JSON
2. Select your acoustic-session JSON file
3. In Power Query Editor:
   - Navigate to frequencySpectrum → data
   - Convert to Table
   - Expand columns
4. Create a scatter plot with:
   - X-axis: frequency (convert to number)
   - Y-axis: magnitude
5. Format X-axis as logarithmic scale
```

## Privacy & Security

✅ **What's saved:**
- Sound classifications (e.g., "Speech", "Music")
- Acoustic metrics (volume, frequency)
- Your notes

❌ **What's NOT saved:**
- Actual audio recordings
- Speech content or conversations
- Personal identifiable information

All data stays on your device. JSON files are only saved where you choose.
