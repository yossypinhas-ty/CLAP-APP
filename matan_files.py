from glob import glob

example_file = '/Users/pinhasy/Downloads/val/AEC Dataset/babble/audio/babble_restaurant/Resampled_kr_noise_restaurant_5__0.wav'

babble_files  = glob('/Users/pinhasy/Downloads/val/*/babble/audio/*/*.wav')
speech_files = glob('/Users/pinhasy/Downloads/val/*/speech/audio/*/*.wav')
music_files  = glob('/Users/pinhasy/Downloads/val/*/music/audio/*/*.wav')
wind_files   = glob('/Users/pinhasy/Downloads/val/*/wind/audio/*/*.wav')
machine_files= glob('/Users/pinhasy/Downloads/val/*/machine/audio/*/*.wav')
speech_in_machine_files = glob('/Users/pinhasy/Downloads/val/augmentations/speech_in_machine/audio/*/*.wav')
speech_in_music_files   = glob('/Users/pinhasy/Downloads/val/augmentations/speech_in_music/audio/*/*.wav')
speech_in_wind_files    = glob('/Users/pinhasy/Downloads/val/augmentations/speech_in_wind/audio/*/*.wav')

for file in speech_in_wind_files:
    snr = float(file.split('SNR_')[-1].replace('.wav',''))
    #run clap app on this file:
    print(f'Processing file: {file} with SNR: {snr}')
    # Here you would add the code to run the CLAP app on the file


