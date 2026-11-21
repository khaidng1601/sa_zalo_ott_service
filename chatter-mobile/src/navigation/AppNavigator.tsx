import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ServerConfigModal } from '../components/ServerConfigModal';
import { useAuth } from '../context/AuthContext';
import { ChatScreen } from '../screens/ChatScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { ConversationsScreen } from '../screens/ConversationsScreen';
import { GroupInfoScreen } from '../screens/GroupInfoScreen';
import { GroupsScreen } from '../screens/GroupsScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { ZaloColors } from '../theme/zaloTheme';
import {
  AppStackParamList,
  AuthStackParamList,
  MainTabParamList,
} from '../types/navigation';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const MainBottomTabs: React.FC = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: ZaloColors.primary,
      tabBarInactiveTintColor: ZaloColors.textMuted,
      tabBarLabelStyle: {
        fontSize: 11.5,
        fontWeight: '600',
        marginBottom: 2,
      },
      tabBarStyle: {
        backgroundColor: '#FFFFFF',
        borderTopColor: ZaloColors.border,
        height: 60,
        paddingTop: 5,
      },
      tabBarIcon: ({ focused, color, size }) => {
        let iconName: keyof typeof Ionicons.glyphMap = 'chatbubbles-outline';
        if (route.name === 'MessagesTab') {
          iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
        } else if (route.name === 'ContactsTab') {
          iconName = focused ? 'people' : 'people-outline';
        } else if (route.name === 'GroupsTab') {
          iconName = focused ? 'grid' : 'grid-outline';
        } else if (route.name === 'ProfileTab') {
          iconName = focused ? 'person' : 'person-outline';
        }
        return <Ionicons name={iconName} size={size} color={color} />;
      },
    })}
  >
    <Tab.Screen
      name="MessagesTab"
      component={ConversationsScreen}
      options={{ tabBarLabel: 'Tin nhắn' }}
    />
    <Tab.Screen
      name="ContactsTab"
      component={ContactsScreen}
      options={{ tabBarLabel: 'Danh bạ' }}
    />
    <Tab.Screen
      name="GroupsTab"
      component={GroupsScreen}
      options={{ tabBarLabel: 'Nhóm' }}
    />
    <Tab.Screen
      name="ProfileTab"
      component={ProfileScreen}
      options={{ tabBarLabel: 'Cá nhân' }}
    />
  </Tab.Navigator>
);

export const AppNavigator: React.FC = () => {
  const {
    isBooting,
    currentUser,
    bootError,
    retryBootSession,
    logout,
    apiBaseUrl,
    updateServerUrl,
  } = useAuth();
  const [serverModalOpen, setServerModalOpen] = useState(false);

  if (isBooting) {
    return (
      <View style={styles.splashContainer}>
        <View style={styles.splashLogo}>
          <Ionicons name="chatbubbles" size={38} color="#FFFFFF" />
        </View>
        <Text style={styles.splashTitle}>Chatter Zalo OTT</Text>
        <ActivityIndicator
          size="small"
          color={ZaloColors.primary}
          style={{ marginTop: 14 }}
        />
      </View>
    );
  }

  if (bootError) {
    return (
      <View style={styles.bootErrorContainer}>
        <Ionicons
          name="cloud-offline-outline"
          size={48}
          color={ZaloColors.danger}
        />
        <Text style={styles.bootErrorTitle}>Không thể kết nối máy chủ</Text>
        <Text style={styles.bootErrorMsg}>{bootError}</Text>

        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => void retryBootSession()}
        >
          <Text style={styles.retryBtnText}>Thử kết nối lại</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.serverBtn}
          onPress={() => setServerModalOpen(true)}
        >
          <Text style={styles.serverBtnText}>
            Đổi địa chỉ máy chủ ({apiBaseUrl})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchAccountBtn}
          onPress={() => void logout()}
        >
          <Text style={styles.switchAccountText}>Đăng nhập tài khoản khác</Text>
        </TouchableOpacity>

        <ServerConfigModal
          visible={serverModalOpen}
          onClose={() => setServerModalOpen(false)}
          currentUrl={apiBaseUrl}
          onSaveUrl={async (url) => {
            await updateServerUrl(url);
            await retryBootSession();
          }}
        />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {currentUser ? (
        <AppStack.Navigator screenOptions={{ headerShown: false }}>
          <AppStack.Screen name="MainTabs" component={MainBottomTabs} />
          <AppStack.Screen name="Chat" component={ChatScreen} />
          <AppStack.Screen name="GroupInfo" component={GroupInfoScreen} />
        </AppStack.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Signup" component={SignupScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: ZaloColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  splashTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: ZaloColors.primary,
  },
  bootErrorContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  bootErrorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: ZaloColors.textPrimary,
    marginTop: 12,
  },
  bootErrorMsg: {
    fontSize: 13,
    color: ZaloColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 20,
    width: '100%',
    backgroundColor: ZaloColors.primary,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14.5,
  },
  serverBtn: {
    marginTop: 10,
    width: '100%',
    backgroundColor: ZaloColors.primarySoft,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  serverBtnText: {
    color: ZaloColors.primary,
    fontWeight: '700',
    fontSize: 13.5,
  },
  switchAccountBtn: {
    marginTop: 16,
    paddingVertical: 8,
  },
  switchAccountText: {
    color: ZaloColors.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
});
