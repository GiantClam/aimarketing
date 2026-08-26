import assert from "node:assert/strict";
import test from "node:test";
import { buildMediaCapabilityInput } from "../runtime/media-input";

test("maps canvas image fields to the OpenAI-compatible image payload without transport configuration", () => {
  const input = buildMediaCapabilityInput("image_generate", {
    provider: "image-main", model: "gpt-image-2", baseUrl: "https://provider.example/v1", apiKey: "not-forwarded",
    imageSize: "1536x1024", imageQuality: "high", imageBackground: "opaque", imageOutputFormat: "webp", imageOutputCompression: 75, imageModeration: "low",
  }, { text: "A product launch image" });
  assert.deepEqual(input, {
    imageSize: "1536x1024", imageQuality: "high", imageBackground: "opaque", imageOutputFormat: "webp", imageOutputCompression: 75, imageModeration: "low",
    text: "A product launch image", prompt: "A product launch image", size: "1536x1024", quality: "high", background: "opaque", output_format: "webp", output_compression: 75, moderation: "low",
  });
});

test("does not send PNG compression and normalizes image edit references", () => {
  const input = buildMediaCapabilityInput("image_generate", {
    imageSize: "1024x1024", imageQuality: "auto", imageOutputFormat: "png", imageOutputCompression: 80,
  }, {
    text: "Edit the product image", referenceImages: ["https://cdn.example.test/product.png"], inputImageUrl: "https://cdn.example.test/product.png",
  });
  assert.equal(input.output_compression, undefined);
  assert.deepEqual(input.referenceImageUrls, ["https://cdn.example.test/product.png"]);
  assert.equal("referenceImages" in input, false);
  assert.equal("inputImageUrl" in input, false);
});

test("routes music and speech nodes to their intended MiniMax operation", () => {
  const music = buildMediaCapabilityInput("music_generate", { provider: "audio-minimax", model: "music-2.6", prompt: "Cinematic instrumental" }, {});
  assert.equal(music.kind, "music");
  assert.equal(music.featureId, "ai-music");
  assert.equal(music.prompt, "Cinematic instrumental");

  const speech = buildMediaCapabilityInput("voice_synthesis", { provider: "audio-minimax", model: "speech-2.8-turbo", text: "Hello" }, {});
  assert.equal(speech.kind, "speech");
  assert.equal(speech.text, "Hello");
  assert.equal("provider" in speech, false);
  assert.equal("model" in speech, false);
});

test("maps a music-cover source reference to MiniMax audio_url", () => {
  const music = buildMediaCapabilityInput("music_generate", { model: "music-cover", sourceAudioUrl: "https://example.test/original.mp3" }, {});
  assert.equal(music.kind, "music");
  assert.equal(music.audio_url, "https://example.test/original.mp3");
  assert.equal("sourceAudioUrl" in music, false);
});

test("uses upstream media outputs as video and digital-human references", () => {
  const video = buildMediaCapabilityInput("video_generate", { provider: "video-main", sound: "on" }, { images: ["https://example.test/first.png", "https://example.test/last.png"] });
  assert.equal(video.firstFrameUrl, "https://example.test/first.png");
  assert.equal(video.lastFrameUrl, "https://example.test/last.png");
  assert.equal(video.generateAudio, true);

  const digitalHuman = buildMediaCapabilityInput("digital_human", {}, { images: ["https://example.test/avatar.png"], audios: ["https://example.test/speech.mp3"] });
  assert.equal(digitalHuman.avatarImageUrl, "https://example.test/avatar.png");
  assert.equal(digitalHuman.audioUrl, "https://example.test/speech.mp3");
});

test("keeps workflow local file paths out of node metadata and exposes them only as runtime attachments", () => {
  const input = buildMediaCapabilityInput("voice_clone", {}, {
    assets: [{ fileName: "reference.wav", mimeType: "audio/wav", byteLength: 2048, localPath: "C:\\media\\reference.wav" }],
  });
  assert.deepEqual(input.localAttachments, ["C:\\media\\reference.wav"]);
  assert.equal(JSON.stringify(input).includes("localPath"), false);
});

test("keeps role-specific video media inputs distinct and ordered", () => {
  const input = buildMediaCapabilityInput("video_generate", { mode: "auto", sound: "off" }, {
    images: ["https://example.test/first.png"],
    "image.last_frame": ["https://example.test/last.png"],
    referenceImages: ["https://example.test/reference-1.png", "https://example.test/reference-2.png"],
    videos: ["https://example.test/source.mp4"],
    referenceVideos: ["https://example.test/reference-1.mp4", "https://example.test/reference-2.mp4"],
    referenceAudios: ["https://example.test/reference.mp3"],
  });
  assert.equal(input.firstFrameUrl, "https://example.test/first.png");
  assert.equal(input.lastFrameUrl, "https://example.test/last.png");
  assert.deepEqual(input.referenceImageUrls, ["https://example.test/reference-1.png", "https://example.test/reference-2.png"]);
  assert.equal(input.sourceVideoUrl, "https://example.test/source.mp4");
  assert.deepEqual(input.referenceVideoUrls, ["https://example.test/reference-1.mp4", "https://example.test/reference-2.mp4"]);
  assert.deepEqual(input.referenceAudioUrls, ["https://example.test/reference.mp3"]);
});

test("requires the role-specific inputs selected by video mode", () => {
  assert.throws(() => buildMediaCapabilityInput("video_generate", { mode: "first-last-frame" }, {
    images: ["https://example.test/first.png"],
  }), /workflow_media_role_required:first-last-frame/);
  assert.throws(() => buildMediaCapabilityInput("video_generate", { mode: "video-edit" }, {}), /workflow_media_role_required:video.source/);
});
