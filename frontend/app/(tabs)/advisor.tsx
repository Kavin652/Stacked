import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { colors, spacing, radius, fonts } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED = [
  "How much can I save this year?",
  "Should I invest or save?",
  "What's a good first ETF?",
];

export default function Advisor() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const loadHistory = useCallback(async () => {
    try {
      const h = await api.get<any[]>("/ai/chat/history");
      if (h.length > 0) {
        setMessages(h.map(m => ({ role: m.role, content: m.content })));
      }
    } catch {}
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const send = async (text?: string) => {
    const message = (text || input).trim();
    if (!message || sending) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: message }]);
    setSending(true);
    Haptics.selectionAsync();
    try {
      const res = await api.post<{ reply: string }>("/ai/chat", { message });
      setMessages(prev => [...prev, { role: "assistant", content: res.reply }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I'm having trouble connecting. Try again in a sec." }]);
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}>
        <View style={styles.header}>
          <View style={styles.avatarOuter}>
            <Ionicons name="sparkles" size={20} color={colors.brand} />
          </View>
          <View>
            <Text style={styles.title}>AI ADVISOR</Text>
            <Text style={styles.subtitle}>Powered by Claude</Text>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.bigAvatar}>
                <Ionicons name="sparkles" size={36} color={colors.brand} />
              </View>
              <Text style={styles.emptyTitle}>HEY {user?.name?.toUpperCase()} 👋</Text>
              <Text style={styles.emptyText}>
                I'm Corn, your AI money mentor. Ask me anything about your spending, savings, or investments.
              </Text>
              <View style={styles.suggestRow}>
                {SUGGESTED.map(s => (
                  <TouchableOpacity key={s} testID={`suggest-${s.slice(0, 10)}`} style={styles.suggestChip} onPress={() => send(s)}>
                    <Text style={styles.suggestText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
              {item.role === "assistant" && (
                <View style={styles.aiTag}>
                  <Ionicons name="sparkles" size={10} color={colors.brand} />
                  <Text style={styles.aiTagText}>CORN</Text>
                </View>
              )}
              <Text style={[styles.bubbleText, item.role === "user" ? { color: colors.onSurface } : { color: colors.onSurfaceSecondary }]}>
                {item.content}
              </Text>
            </View>
          )}
          ListFooterComponent={sending ? (
            <View style={[styles.bubble, styles.aiBubble, { flexDirection: "row", alignItems: "center", gap: spacing.sm }]}>
              <ActivityIndicator color={colors.brand} size="small" />
              <Text style={{ color: colors.onSurfaceTertiary, fontFamily: fonts.body }}>Thinking...</Text>
            </View>
          ) : null}
        />

        <View style={styles.inputRow}>
          <TextInput
            testID="advisor-input"
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your money..."
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
            multiline
            maxLength={500}
            onSubmitEditing={() => send()}
          />
          <TouchableOpacity testID="advisor-send-button" style={styles.sendBtn} onPress={() => send()} disabled={sending || !input.trim()}>
            <Ionicons name="arrow-up" size={20} color={colors.onBrand} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatarOuter: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brand },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 22, letterSpacing: 1 },
  subtitle: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 11 },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  emptyWrap: { alignItems: "center", paddingVertical: spacing.xxxl, gap: spacing.md },
  bigAvatar: { width: 88, height: 88, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brand },
  emptyTitle: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 28, letterSpacing: 1, marginTop: spacing.md },
  emptyText: { fontFamily: fonts.body, color: colors.onSurfaceTertiary, fontSize: 14, textAlign: "center", paddingHorizontal: spacing.xl, lineHeight: 22 },
  suggestRow: { gap: spacing.sm, marginTop: spacing.lg, width: "100%", paddingHorizontal: spacing.xl },
  suggestChip: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  suggestText: { fontFamily: fonts.body, color: colors.onSurfaceSecondary, fontSize: 13 },
  bubble: { padding: spacing.md, borderRadius: radius.md, maxWidth: "85%" },
  aiBubble: { backgroundColor: colors.surfaceSecondary, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  userBubble: { backgroundColor: colors.brandTertiary, alignSelf: "flex-end", borderWidth: 1, borderColor: colors.brand, borderTopRightRadius: 4 },
  aiTag: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  aiTagText: { fontFamily: fonts.bodyBold, color: colors.brand, fontSize: 10, letterSpacing: 1 },
  bubbleText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  inputRow: { flexDirection: "row", padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, alignItems: "flex-end" },
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, fontFamily: fonts.body, fontSize: 14, maxHeight: 100, borderWidth: 1, borderColor: colors.border },
  sendBtn: { backgroundColor: colors.brand, width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
