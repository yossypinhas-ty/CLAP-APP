# 🎵 YAMNet Audio Detector

A real-time audio event detection web application powered by Google's YAMNet model and TensorFlow.js. This app listens to sounds around you and identifies them in real-time, running entirely in your browser!

## ✨ Features

- 🎤 **Real-time Audio Detection**: Captures and analyzes audio from your microphone
- 🧠 **YAMNet Model**: Uses Google's pre-trained YAMNet model to detect 521 different audio event classes
- 🌐 **Browser-based**: Runs completely in the browser using TensorFlow.js - no backend required
- 🎨 **Beautiful UI**: Modern, responsive interface with confidence scores and visual feedback
- 🔒 **Privacy-first**: All processing happens locally in your browser

## 🎯 What Can It Detect?

YAMNet can identify 521 different audio event classes including:
- 🗣️ Speech and human sounds
- 🎵 Music and musical instruments
- 🐕 Animal sounds
- 🚗 Vehicles
- 🏠 Environmental sounds
- And much more!

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- A modern web browser with microphone access

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd "CLAP APP"
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:3000`

5. Click "Start Listening" and allow microphone access when prompted

## 📦 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🛠️ Technologies Used

- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **TensorFlow.js** - Machine learning in the browser
- **YAMNet** - Pre-trained audio classification model

## 📱 Usage

1. **Start Detection**: Click the "Start Listening" button
2. **Allow Microphone Access**: Your browser will ask for permission
3. **Make Some Noise**: The app will detect and display sounds in real-time
4. **View Results**: See detected sounds with confidence scores
5. **Stop Detection**: Click "Stop" when done

## 🎨 Features in Detail

### Real-time Detection
- Processes audio continuously while listening
- Updates detection results instantly
- Shows top 5 most confident predictions

### Confidence Scores
- Visual confidence bars for each detection
- Percentage scores for accuracy
- Only shows detections above 30% confidence

### Sound History
- Keeps track of the last 20 detections
- Timestamped results
- Smooth animations for new detections

## 🔒 Privacy & Security

- **No data is sent to any server** - everything runs locally
- **No audio is stored** - audio is processed in real-time and discarded
- **Browser-based** - uses standard Web Audio API

## 🐛 Troubleshooting

**Model not loading?**
- Check your internet connection (model downloads on first use)
- Clear browser cache and reload

**Microphone not working?**
- Ensure you've granted microphone permissions
- Check browser console for errors
- Try refreshing the page

**No detections showing?**
- Make sure there's actually sound in your environment
- Check that your microphone is working in other apps
- Try increasing the volume of sounds

## 📄 License

MIT

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 👏 Acknowledgments

- Google Research for the YAMNet model
- TensorFlow.js team for browser ML capabilities
- AudioSet dataset for training data

---

Made with ❤️ using React, TypeScript, and TensorFlow.js
