// Initialize Icons
lucide.createIcons();

// Elements
const btnSelectFolder = document.getElementById('select-folder-btn');
const playlistContainer = document.getElementById('playlist');
const trackCount = document.getElementById('track-count');

const currentTitleLarge = document.getElementById('current-title-large');
const currentArtistLarge = document.getElementById('current-artist-large');
const currentTitle = document.getElementById('current-title');
const currentArtist = document.getElementById('current-artist');

const albumArtContainer = document.querySelector('.album-art-container');
const albumArt = document.getElementById('album-art');
const albumArtFallback = document.getElementById('album-art-fallback');
const miniAlbumArt = document.getElementById('mini-album-art');
const miniArtFallback = document.getElementById('mini-art-fallback');

const btnShuffle = document.getElementById('btn-shuffle');
const btnPlay = document.getElementById('btn-play');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const playIcon = document.getElementById('play-wrapper');
const pauseIcon = document.getElementById('pause-wrapper');
const progressBar = document.getElementById('progress-bar');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const volumeBar = document.getElementById('volume-bar');
const volMute = document.getElementById('vol-mute');
const volLow = document.getElementById('vol-low');
const volHigh = document.getElementById('vol-high');

// State
let playlist = [];
let currentTrackIndex = -1;
let isPlaying = false;
let isShuffle = false;
let audio = new Audio();

audio.volume = 1;

// Format time utility
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Select Local Folder recursively
async function scanDirectory(dirHandle, result) {
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            const name = entry.name.toLowerCase();
            if (name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.ogg') || name.endsWith('.flac') || name.endsWith('.m4a')) {
                result.push(entry);
            }
        } else if (entry.kind === 'directory') {
            await scanDirectory(entry, result);
        }
    }
}

const fallbackInput = document.getElementById('fallback-folder-input');

function handleFiles(files) {
    if (files.length > 0) {
        playlist = files.map(handle => ({
            handle: handle,
            name: handle.name,
            title: handle.name.replace(/\.[^/.]+$/, ""), // remove extension
            artist: 'Unknown Artist',
            metadataLoaded: false,
            pictureUrl: null
        }));
        
        renderPlaylist();
        trackCount.textContent = `${playlist.length} track${playlist.length > 1 ? 's' : ''}`;
        
        // Auto play first track
        if (playlist.length > 0) {
            playTrack(0);
        }
    } else {
        alert('No audio files found in the selected folder.');
    }
}

btnSelectFolder.addEventListener('click', async () => {
    // Some browsers have window.showDirectoryPicker but it fails context
    try {
        if (window.showDirectoryPicker) {
            const dirHandle = await window.showDirectoryPicker();
            const files = [];
            await scanDirectory(dirHandle, files);
            handleFiles(files);
        } else {
            fallbackInput.click();
        }
    } catch (err) {
        console.error('Folder selection cancelled or failed.', err);
        // If it's not simply user cancelling, fallback
        if (err.name !== 'AbortError') {
            fallbackInput.click();
        }
    }
});

fallbackInput.addEventListener('change', (e) => {
    const fileList = e.target.files;
    const files = [];
    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const name = file.name.toLowerCase();
        if (name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.ogg') || name.endsWith('.flac') || name.endsWith('.m4a')) {
            files.push({
                kind: 'file',
                name: file.name,
                getFile: async () => file // Mock handle object so getFile() returns the Blob/File directly
            });
        }
    }
    handleFiles(files);
});

function renderPlaylist() {
    playlistContainer.innerHTML = '';
    
    playlist.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item' + (index === currentTrackIndex ? ' active' : '');
        item.onclick = () => playTrack(index);
        
        item.innerHTML = `
            <div class="track-icon">
                <i data-lucide="${index === currentTrackIndex && isPlaying ? 'bar-chart-2' : 'music'}"></i>
            </div>
            <div class="track-details">
                <div class="track-name" id="pl-title-${index}">${track.title}</div>
                <div class="track-artist" id="pl-artist-${index}">${track.artist}</div>
            </div>
        `;
        
        playlistContainer.appendChild(item);
    });
    
    lucide.createIcons();
}

async function playTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    
    currentTrackIndex = index;
    const track = playlist[index];
    
    // Cleanup previous object URL to save memory
    if (audio.src && audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
    }
    
    try {
        const file = await track.handle.getFile();
        const objUrl = URL.createObjectURL(file);
        audio.src = objUrl;
        
        // Reset Progress
        progressBar.value = 0;
        timeCurrent.textContent = '0:00';
        
        audio.play();
        isPlaying = true;
        updatePlayState();
        
        // Update UI Text
        updateTrackInfoUI(track);
        renderPlaylist(); // Update active styles
        
        // Read ID3 Data dynamically if not already loaded
        if(!track.metadataLoaded) {
           readMetadata(file, track, index);
        }

    } catch (err) {
        console.error('Failed to play file format', err);
        alert('Browser blocked playback or file format not supported.');
    }
}

function readMetadata(file, track, index) {
    if (!window.jsmediatags) {
        console.warn("jsmediatags library not loaded");
        track.metadataLoaded = true;
        return;
    }
    
    jsmediatags.read(file, {
        onSuccess: function(tag) {
            const tags = tag.tags;
            let updated = false;
            
            if (tags.title) {
                track.title = tags.title;
                updated = true;
            }
            if (tags.artist) {
                track.artist = tags.artist;
                updated = true;
            }
            if (tags.picture) {
                const data = tags.picture.data;
                const format = tags.picture.format;
                let base64String = "";
                for (let i = 0; i < data.length; i++) {
                    base64String += String.fromCharCode(data[i]);
                }
                track.pictureUrl = `data:${format};base64,${window.btoa(base64String)}`;
                updated = true;
            }
            
            track.metadataLoaded = true;
            
            if (updated) {
                // Update specific playlist item
                const titleEl = document.getElementById(`pl-title-${index}`);
                const artistEl = document.getElementById(`pl-artist-${index}`);
                if (titleEl) titleEl.textContent = track.title;
                if (artistEl) artistEl.textContent = track.artist;
                
                // If this is still the current track, update UI
                if (currentTrackIndex === index) {
                    updateTrackInfoUI(track);
                }
            }
        },
        onError: function(error) {
            console.log('Error reading tags', error);
            track.metadataLoaded = true;
        }
    });
}

function updateTrackInfoUI(track) {
    currentTitle.textContent = track.title;
    currentArtist.textContent = track.artist;
    currentTitleLarge.textContent = track.title;
    currentArtistLarge.textContent = track.artist;
    
    if (track.pictureUrl) {
        albumArt.src = track.pictureUrl;
        miniAlbumArt.src = track.pictureUrl;
        
        albumArt.classList.remove('hide');
        albumArtFallback.classList.add('hide');
        miniAlbumArt.classList.remove('hide');
        miniArtFallback.classList.add('hide');
    } else {
        albumArt.classList.add('hide');
        albumArtFallback.classList.remove('hide');
        miniAlbumArt.classList.add('hide');
        miniArtFallback.classList.remove('hide');
    }
}

function togglePlay() {
    if (!audio.src) {
        if (playlist.length > 0) playTrack(0);
        return;
    }
    
    if (isPlaying) {
        audio.pause();
    } else {
        audio.play();
    }
    isPlaying = !isPlaying;
    updatePlayState();
    renderPlaylist(); // to update the playing icon vs static icon
}

function updatePlayState() {
    if (isPlaying) {
        playIcon.classList.add('hide');
        pauseIcon.classList.remove('hide');
        document.body.classList.add('playing');
        if(albumArtContainer) albumArtContainer.closest('.now-playing-view').classList.add('playing');
    } else {
        playIcon.classList.remove('hide');
        pauseIcon.classList.add('hide');
        document.body.classList.remove('playing');
        if(albumArtContainer) albumArtContainer.closest('.now-playing-view').classList.remove('playing');
    }
}

// Audio Events
audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
        const progress = (audio.currentTime / audio.duration) * 100;
        progressBar.value = progress;
        timeCurrent.textContent = formatTime(audio.currentTime);
        // Only update total time if it was 0 (avoids flickering)
        if (timeTotal.textContent === '0:00' || timeTotal.textContent === 'NaN:NaN') {
            timeTotal.textContent = formatTime(audio.duration);
        }
    }
});

audio.addEventListener('ended', () => {
    if (isShuffle && playlist.length > 1) {
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * playlist.length);
        } while (nextIndex === currentTrackIndex);
        playTrack(nextIndex);
    } else if (currentTrackIndex < playlist.length - 1) {
        playTrack(currentTrackIndex + 1);
    } else {
        isPlaying = false;
        updatePlayState();
    }
});

audio.addEventListener('loadedmetadata', () => {
    timeTotal.textContent = formatTime(audio.duration);
});

// Controls
btnShuffle.addEventListener('click', () => {
    isShuffle = !isShuffle;
    if (isShuffle) {
        btnShuffle.classList.add('active');
    } else {
        btnShuffle.classList.remove('active');
    }
});

btnPlay.addEventListener('click', togglePlay);

btnPrev.addEventListener('click', () => {
    if (audio.currentTime > 3) {
        audio.currentTime = 0; // if played for a bit, restart track
    } else if (currentTrackIndex > 0) {
        playTrack(currentTrackIndex - 1);
    }
});

btnNext.addEventListener('click', () => {
    if (isShuffle && playlist.length > 1) {
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * playlist.length);
        } while (nextIndex === currentTrackIndex);
        playTrack(nextIndex);
    } else if (currentTrackIndex < playlist.length - 1) {
        playTrack(currentTrackIndex + 1);
    }
});

// Progress Bar
progressBar.addEventListener('input', () => {
    if (audio.duration) {
        const time = (progressBar.value / 100) * audio.duration;
        audio.currentTime = time;
    }
});

// Volume
volumeBar.addEventListener('input', () => {
    audio.volume = volumeBar.value;
    
    volMute.classList.add('hide');
    volLow.classList.add('hide');
    volHigh.classList.add('hide');

    if (audio.volume == 0) {
        volMute.classList.remove('hide');
    } else if (audio.volume < 0.5) {
        volLow.classList.remove('hide');
    } else {
        volHigh.classList.remove('hide');
    }
});

// Handle Spacebar to Play/Pause
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        togglePlay();
    }
});
