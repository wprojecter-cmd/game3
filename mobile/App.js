import React from "react";
import { StatusBar, StyleSheet, View, ActivityIndicator, Text } from "react-native";
import { WebView } from "react-native-webview";

const GAME_URL = process.env.EXPO_PUBLIC_GAME_URL || "https://game3.onrender.com";

export default function App() {
  return <View style={styles.root}>
    <StatusBar hidden />
    <WebView
      source={{ uri: GAME_URL }}
      style={styles.web}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo
      originWhitelist={["https://*", "http://localhost:*"]}
      startInLoadingState
      renderLoading={() => <View style={styles.loading}><ActivityIndicator size="large" color="#55d7f6"/><Text style={styles.text}>Loading GAME3…</Text></View>}
    />
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#07111f" },
  web: { flex: 1, backgroundColor: "#07111f" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#07111f" },
  text: { color: "#9bb5c8" }
});
