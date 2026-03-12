import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function WebNotice() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Ionicons name="phone-portrait" size={80} color="#FF6B35" />
        <Text style={styles.title}>Mobile-Only Application</Text>
        <Text style={styles.subtitle}>Restaurant POS System</Text>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>This is a Native Mobile App</Text>
          <Text style={styles.infoText}>
            This Restaurant POS system is designed exclusively for mobile devices (Android/iOS) 
            and requires native features like:
          </Text>
          
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color="#4ECDC4" />
              <Text style={styles.featureText}>Local SQLite Database</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color="#4ECDC4" />
              <Text style={styles.featureText}>Offline-First Architecture</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color="#4ECDC4" />
              <Text style={styles.featureText}>Bluetooth Printer Support</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color="#4ECDC4" />
              <Text style={styles.featureText}>AES-256 Encryption</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color="#4ECDC4" />
              <Text style={styles.featureText}>Secure Local Storage</Text>
            </View>
          </View>
        </View>

        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>How to Use This App</Text>
          
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Install Expo Go</Text>
              <Text style={styles.stepText}>
                Download Expo Go from the App Store (iOS) or Google Play Store (Android)
              </Text>
            </View>
          </View>

          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Scan QR Code</Text>
              <Text style={styles.stepText}>
                Use the Expo Go app to scan the QR code from your development console
              </Text>
            </View>
          </View>

          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Test on Device</Text>
              <Text style={styles.stepText}>
                The app will load on your mobile device with full native functionality
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.demoCard}>
          <Text style={styles.demoTitle}>Demo Credentials</Text>
          <View style={styles.credentialRow}>
            <Text style={styles.credentialLabel}>Admin:</Text>
            <Text style={styles.credentialValue}>admin / 1234 (PIN)</Text>
          </View>
          <View style={styles.credentialRow}>
            <Text style={styles.credentialLabel}>Captain:</Text>
            <Text style={styles.credentialValue}>captain / 9012 (PIN)</Text>
          </View>
          <View style={styles.credentialRow}>
            <Text style={styles.credentialLabel}>Cashier:</Text>
            <Text style={styles.credentialValue}>cashier / 3456 (PIN)</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Offline-First • Privacy-Focused • Secure
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginTop: 24,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    marginTop: 32,
    width: '100%',
    maxWidth: 600,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 20,
  },
  featureList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 16,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  instructionsCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    marginTop: 24,
    width: '100%',
    maxWidth: 600,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  instructionsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 20,
  },
  step: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 16,
  },
  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  stepText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  demoCard: {
    backgroundColor: '#FFF5F0',
    borderRadius: 16,
    padding: 24,
    marginTop: 24,
    width: '100%',
    maxWidth: 600,
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  demoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginBottom: 16,
  },
  credentialRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  credentialLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    width: 80,
  },
  credentialValue: {
    fontSize: 14,
    color: '#1A1A1A',
    fontFamily: 'monospace',
  },
  footer: {
    fontSize: 14,
    color: '#999',
    marginTop: 32,
    textAlign: 'center',
  },
});
