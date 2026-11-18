export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type MainTabParamList = {
  MessagesTab: undefined;
  ContactsTab: undefined;
  GroupsTab: undefined;
  ProfileTab: undefined;
};

export type AppStackParamList = {
  MainTabs: undefined;
  Chat: {
    conversationId: string;
    initialTitle?: string;
  };
  GroupInfo: {
    conversationId: string;
  };
};
