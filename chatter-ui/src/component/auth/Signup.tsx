import { Link } from "react-router-dom";
import { Link as MuiLink } from "@mui/material";
import { useNavigate } from "react-router-dom";
import Auth from "./Auth";
import { graphqlRequest, setAccessToken } from "../../services/graphql";

const Signup = () => {
    const navigate = useNavigate();

    return <Auth mode="register" submitLabel="Đăng ký" onSubmit={async ({ email, password, displayName }) => {
        const result = await graphqlRequest<{
            register: { accessToken: string };
        }>(
            `mutation Register($input: CreateUserInput!) {
                register(createUserInput: $input) {
                    accessToken
                }
            }`,
            { input: { email, password, displayName } },
        );
        setAccessToken(result.register.accessToken);
        navigate("/", { replace: true });
    }}>
        <Link to={"/login"} style ={{ textDecoration: "none" , alignSelf: "center", marginTop: "10px"}}>
            <MuiLink component="span" variant="body2">
                Đã có tài khoản? Đăng nhập
            </MuiLink>
        </Link>
    </Auth>;
};

export default Signup;