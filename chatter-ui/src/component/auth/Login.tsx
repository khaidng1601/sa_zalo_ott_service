import { Link } from "react-router-dom";
import { Link as MuiLink } from "@mui/material";
import { useNavigate } from "react-router-dom";
import Auth from "./Auth";
import { graphqlRequest, setAccessToken } from "../../services/graphql";

const Login = () => {
    const navigate = useNavigate();

    return <Auth mode="login" submitLabel="Đăng nhập" onSubmit={async ({ email, password }) => {
        const result = await graphqlRequest<{
            login: { accessToken: string };
        }>(
            `mutation Login($email: String!, $password: String!) {
                login(email: $email, password: $password) {
                    accessToken
                }
            }`,
            { email, password },
        );
        setAccessToken(result.login.accessToken);
        navigate("/", { replace: true });
    }}>
        <Link to={"/signup"} style ={{ textDecoration: "none" , alignSelf: "center", marginTop: "10px"}}>
            <MuiLink component="span" variant="body2">
                Chưa có tài khoản? Đăng ký
            </MuiLink>
        </Link>
    </Auth>;
};

export default Login;